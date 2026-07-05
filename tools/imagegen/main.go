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

// gameInfo gives each game a title and a short genre/setting anchor, keyed
// by a stable name slug (e.g. "planetfall"), not by gameId — a game can
// have many known gameId releases (PC/Mac/Amiga/bug-fix revisions), so the
// gameId → name resolution lives separately in aliases.json. The reference
// images used for style-matching are Zork scenes (forest, house, grass,
// sky) — without the description anchor, that pastoral content bleeds into
// games with a completely different setting (e.g. Planetfall's sci-fi
// corridors ending up with grassy windows not in the room text at all).
// Both files are loaded from web/src/context/ (shared with the JS player's
// imagegen/index.js — edit those files, not this one, to add/change a game).
type gameInfo struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

var (
	games   map[string]gameInfo
	aliases map[string]string
)

func loadJSON(path string, v interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("parse %s: %w", filepath.Base(path), err)
	}
	return nil
}

// slugify turns a room title into a filesystem/URL-safe slug. Must produce
// identical output to slugify() in web/src/js/imagegen/index.js — both
// sides write/read the same filenames.
var slugifyRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(title string) string {
	s := slugifyRe.ReplaceAllString(strings.ToLower(title), "-")
	return strings.Trim(s, "-")
}

// buildPrompt is a direct port of buildPrompt() from player/js/imagegen/index.js.
func buildPrompt(gameID, title, description string) string {
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

	gameName := aliases[gameID]
	context := games[gameName].Description
	if context != "" {
		context += " "
	}

	return "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
		context +
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
	contextDir := flag.String("context", "./player/context", "directory containing games.json and aliases.json")
	outDir := flag.String("out", "./images", "output directory")
	model := flag.String("model", "gpt-image-2-2026-04-21", "OpenAI image model")
	workers := flag.Int("concurrency", 3, "parallel API requests")
	limit := flag.Int("limit", 0, "stop after N images (0 = no limit)")
	keyBy := flag.String("keyby", "title", `output filename scheme: "title" (default, slugified title, shared across releases) or "id" (raw roomId, precise but only valid for the exact release rooms.json was built from)`)
	flag.Parse()

	if *keyBy != "title" && *keyBy != "id" {
		log.Fatalf("-keyby must be \"title\" or \"id\", got %q", *keyBy)
	}

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

	if err := loadJSON(filepath.Join(*contextDir, "games.json"), &games); err != nil {
		log.Fatalf("read games.json: %v", err)
	}
	if err := loadJSON(filepath.Join(*contextDir, "aliases.json"), &aliases); err != nil {
		log.Fatalf("read aliases.json: %v", err)
	}

	if len(rooms) == 0 {
		log.Fatal("no rooms in JSON")
	}
	gameID := rooms[0].GameID
	gameName := aliases[gameID]
	if gameName == "" {
		log.Fatalf("gameId %s not found in aliases.json — add it there first", gameID)
	}
	log.Printf("gameId: %s (%s)", gameID, gameName)

	imageDir := filepath.Join(*outDir, gameName)
	if *keyBy == "id" {
		imageDir = filepath.Join(imageDir, "id")
	}
	if err := os.MkdirAll(imageDir, 0755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}

	outFilename := func(room RoomEntry) string {
		if *keyBy == "id" {
			return fmt.Sprintf("%d.webp", room.RoomID)
		}
		return slugify(room.Title) + ".webp"
	}

	type job struct{ room RoomEntry }
	jobs := make(chan job, len(rooms))

	queued, skipped, tooShort := 0, 0, 0
	for _, room := range rooms {
		outPath := filepath.Join(imageDir, outFilename(room))
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
				outPath := filepath.Join(imageDir, outFilename(room))
				prompt := buildPrompt(room.GameID, room.Title, room.Description)

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
