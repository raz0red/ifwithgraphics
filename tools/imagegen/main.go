package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/png"

	"github.com/chai2010/webp"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
)

type RoomEntry struct {
	GameID      string `json:"gameId"`
	RoomID      int    `json:"roomId"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

var (
	statusSuffixRe   = regexp.MustCompile(`(?i)\s+(Time|Score|Moves|Turns):.*`)
	whitespaceRe     = regexp.MustCompile(`\s+`)
	trailingPromptRe = regexp.MustCompile(`(?m)\n[^\n]*\?\s*$`)
)

// buildPrompt is a direct port of buildPrompt() from player/js/imagegen/index.js.
func buildPrompt(title, description string) string {
	roomName := strings.TrimSpace(statusSuffixRe.ReplaceAllString(title, ""))
	roomName = whitespaceRe.ReplaceAllString(roomName, " ")

	start := 0
	if roomName != "" {
		escaped := regexp.QuoteMeta(roomName)
		re := regexp.MustCompile(`(?i)(?:^|\n)\s*` + escaped + `\b`)
		if loc := re.FindStringIndex(description); loc != nil && loc[0] > 0 {
			start = loc[0]
		}
	}

	desc := description[start:]
	desc = trailingPromptRe.ReplaceAllString(desc, "")
	desc = strings.TrimSpace(whitespaceRe.ReplaceAllString(desc, " "))
	if len(desc) > 400 {
		desc = desc[:400]
	}

	name := roomName
	if name == "" {
		name = title
	}

	return "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
		fmt.Sprintf("Scene: '%s' — %s ", name, desc) +
		"Contained within a pixelated dithered border. " +
		"Strict limited palette and artifacting of the classic reference style, with clear textured dithering. " +
		"Letterboxed: solid pure black bars of at least 250px at the very top and very bottom of the 1024x1024 canvas, " +
		"scene content in the middle 500px landscape strip only. " +
		"NO text, NO letters, NO words, NO UI, NO status bar, NO HUD anywhere in the image."
}

// callAPI mirrors generateWithRefs() in player/js/imagegen/openai.js.
func callAPI(apiKey, model, prompt string, refs [][]byte) (image.Image, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("model", model)
	_ = w.WriteField("prompt", prompt)
	_ = w.WriteField("n", "1")
	_ = w.WriteField("size", "1024x1024")
	_ = w.WriteField("quality", "medium")
	for i, ref := range refs {
		h := textproto.MIMEHeader{}
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="image[]"; filename="ref%d.png"`, i+1))
		h.Set("Content-Type", "image/png")
		part, err := w.CreatePart(h)
		if err != nil {
			return nil, err
		}
		if _, err := part.Write(ref); err != nil {
			return nil, err
		}
	}
	w.Close()

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/images/edits", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", w.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	if result.Error != nil {
		return nil, fmt.Errorf("API error: %s", result.Error.Message)
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("no image data in response")
	}

	item := result.Data[0]
	var imgBytes []byte
	if item.B64JSON != "" {
		imgBytes, err = base64.StdEncoding.DecodeString(item.B64JSON)
		if err != nil {
			return nil, fmt.Errorf("decode b64: %w", err)
		}
	} else if item.URL != "" {
		r, err := http.Get(item.URL)
		if err != nil {
			return nil, err
		}
		defer r.Body.Close()
		imgBytes, err = io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("no image data in response")
	}

	return png.Decode(bytes.NewReader(imgBytes))
}

// cropBlackBars mirrors cropAndCompress() in player/js/imagegen/index.js.
func cropBlackBars(img image.Image) image.Image {
	bounds := img.Bounds()
	w := bounds.Max.X - bounds.Min.X

	rowBrightness := func(y int) float64 {
		var sum float64
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			sum += float64(r>>8) + float64(g>>8) + float64(b>>8)
		}
		return sum / float64(w)
	}

	const thresh = 30.0
	top, bottom := bounds.Min.Y, bounds.Max.Y-1
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		if rowBrightness(y) > thresh {
			top = y
			break
		}
	}
	for y := bounds.Max.Y - 1; y >= bounds.Min.Y; y-- {
		if rowBrightness(y) > thresh {
			bottom = y
			break
		}
	}

	type subImager interface {
		SubImage(image.Rectangle) image.Image
	}
	if si, ok := img.(subImager); ok {
		return si.SubImage(image.Rect(bounds.Min.X, top, bounds.Max.X, bottom+1))
	}
	return img
}

func main() {
	apiKey := flag.String("key", os.Getenv("OPENAI_API_KEY"), "OpenAI API key (or set OPENAI_API_KEY)")
	refsDir := flag.String("refs", "./player/prompt", "directory containing prompt1.png and prompt2.png")
	outDir := flag.String("out", "./images", "output directory")
	model := flag.String("model", "gpt-image-2-2026-04-21", "OpenAI image model")
	workers := flag.Int("concurrency", 3, "parallel API requests")
	limit := flag.Int("limit", 0, "stop after N images (0 = no limit)")
	flag.Parse()

	jsonPath := flag.Arg(0)
	if jsonPath == "" {
		fmt.Fprintln(os.Stderr, "usage: imagegen [flags] <rooms.json>")
		os.Exit(1)
	}
	if *apiKey == "" {
		log.Fatal("API key required: use -key or set OPENAI_API_KEY")
	}

	data, err := os.ReadFile(jsonPath)
	if err != nil {
		log.Fatalf("read json: %v", err)
	}
	var rooms []RoomEntry
	if err := json.Unmarshal(data, &rooms); err != nil {
		log.Fatalf("parse json: %v", err)
	}

	ref1, err := os.ReadFile(filepath.Join(*refsDir, "prompt1.png"))
	if err != nil {
		log.Fatalf("read prompt1.png: %v", err)
	}
	ref2, err := os.ReadFile(filepath.Join(*refsDir, "prompt2.png"))
	if err != nil {
		log.Fatalf("read prompt2.png: %v", err)
	}
	refs := [][]byte{ref1, ref2}

	if len(rooms) == 0 {
		log.Fatal("no rooms in JSON")
	}
	gameID := rooms[0].GameID
	log.Printf("gameId: %s", gameID)

	imageDir := filepath.Join(*outDir, gameID)
	if err := os.MkdirAll(imageDir, 0755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}

	type job struct{ room RoomEntry }
	jobs := make(chan job, len(rooms))

	queued, skipped, tooShort := 0, 0, 0
	for _, room := range rooms {
		outPath := filepath.Join(imageDir, fmt.Sprintf("%d.webp", room.RoomID))
		if _, err := os.Stat(outPath); err == nil {
			skipped++
			continue
		}
		if room.Description == "" {
			tooShort++
			continue
		}
		jobs <- job{room}
		queued++
	}
	close(jobs)
	log.Printf("%d queued, %d already done, %d skipped (too short)", queued, skipped, tooShort)

	var done atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				if *limit > 0 && int(done.Load()) >= *limit {
					return
				}
				room := j.room
				outPath := filepath.Join(imageDir, fmt.Sprintf("%d.webp", room.RoomID))
				prompt := buildPrompt(room.Title, room.Description)

				log.Printf("generating [%d] %s", room.RoomID, room.Title)

				img, err := callAPI(*apiKey, *model, prompt, refs)
				if err != nil {
					log.Printf("ERROR [%d] %s: %v", room.RoomID, room.Title, err)
					continue
				}

				f, err := os.Create(outPath)
				if err != nil {
					log.Printf("ERROR [%d] create: %v", room.RoomID, err)
					continue
				}
				if err := webp.Encode(f, cropBlackBars(img), &webp.Options{Quality: 90}); err != nil {
					f.Close()
					log.Printf("ERROR [%d] encode: %v", room.RoomID, err)
					continue
				}
				f.Close()
				done.Add(1)
				log.Printf("done [%d] %s", room.RoomID, room.Title)
			}
		}()
	}

	wg.Wait()
	log.Printf("all done — %d images generated", done.Load())
}
