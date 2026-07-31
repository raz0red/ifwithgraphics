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
// Both files are loaded from player/src/context/ (shared with the JS player's
// imagegen/index.js — edit those files, not this one, to add/change a game).
type gameInfo struct {
	Title           string `json:"title"`
	Description     string `json:"description"`
	TitleKeyPattern string `json:"titleKeyPattern"`
}

// variantRule mirrors variants.json's per-title override rules (see
// resolveTitle below and resolveTitle() in player/js/imagegen/index.js).
type variantRule struct {
	Match string `json:"match"`
	Title string `json:"title"`
}

var (
	games    map[string]gameInfo
	aliases  map[string]string
	variants map[string]map[string][]variantRule
)

// resolveTitle is a direct port of resolveTitle() in
// player/js/imagegen/index.js. Some rooms show meaningfully different
// scenery depending on dynamic game state (e.g. a character's described
// appearance changes later in the story) even though the room title never
// changes; variants.json is an additive, manually-curated table of
// {match, title} rules — most rooms have no entry and this is a no-op.
func resolveTitle(gameName, title, description string) string {
	rules := variants[gameName][title]
	if rules == nil {
		return title
	}
	lower := strings.ToLower(description)
	for _, rule := range rules {
		if strings.Contains(lower, strings.ToLower(rule.Match)) {
			return rule.Title
		}
	}
	return title
}

// normalizeDynamicTitle is a direct port of normalizeDynamicTitle() in
// player/js/imagegen/index.js. Some games build the room title out of
// static game state plus text the player themselves typed earlier
// (Bureaucracy's outdoor locations echo the street name from the player's
// licence-application form — "234 Sf" for a player who typed "Sf"). That
// makes the title different per player/playthrough for what's structurally
// the same game-assigned location, so it can never hit a shared image —
// games.json's optional titleKeyPattern is a per-game regex with one
// capture group around the stable part.
func normalizeDynamicTitle(gameName, title string) string {
	pattern := games[gameName].TitleKeyPattern
	if pattern == "" {
		return title
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		log.Printf("WARNING: bad titleKeyPattern for %s: %v", gameName, err)
		return title
	}
	m := re.FindStringSubmatch(title)
	if len(m) < 2 {
		return title
	}
	return m[1]
}

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
// identical output to slugify() in player/src/js/imagegen/index.js — both
// sides write/read the same filenames.
var slugifyRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(title string) string {
	s := slugifyRe.ReplaceAllString(strings.ToLower(title), "-")
	return strings.Trim(s, "-")
}

// buildPrompt is a direct port of buildPrompt() from player/js/imagegen/index.js.
//
// Different games place the room-name line in different spots relative to
// the actual descriptive prose — before it, after it, or with more text on
// both sides straddling it (e.g. a custom fantasy game where the title
// showed up after the prose, or in the middle of it with more text
// following). Stripping "from the title line onward" — the tool's earlier
// approach — silently discards whichever side ends up holding the real
// description. Instead, strip out just the bare room-name line itself,
// wherever it falls, and keep everything else.
func buildPrompt(gameID, title, description string) string {
	roomName := strings.TrimSpace(statusSuffixRe.ReplaceAllString(title, ""))
	roomName = whitespaceRe.ReplaceAllString(roomName, " ")

	desc := description
	if roomName != "" {
		escaped := regexp.QuoteMeta(roomName)
		titleLineRe := regexp.MustCompile(`(?i)(?:^|\n)\s*` + escaped + `\s*(?:\n|$)`)
		desc = titleLineRe.ReplaceAllString(desc, "\n")
	}
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
		context = fmt.Sprintf("Background story context, for overall genre/mood/setting only — do not depict this directly unless the scene described below explicitly calls for it: %s ", context)
	}

	return "Apple II-style dithered pixel art scene matching the aesthetic of the reference images. " +
		context +
		fmt.Sprintf("Scene to depict: '%s' — %s ", name, desc) +
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

	if err := loadJSON(filepath.Join(*contextDir, "games.json"), &games); err != nil {
		log.Fatalf("read games.json: %v", err)
	}
	if err := loadJSON(filepath.Join(*contextDir, "aliases.json"), &aliases); err != nil {
		log.Fatalf("read aliases.json: %v", err)
	}
	if err := loadJSON(filepath.Join(*contextDir, "variants.json"), &variants); err != nil {
		log.Fatalf("read variants.json: %v", err)
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

	// Every room gets exactly one API call, keyed by its unique roomId — that's
	// the only key precise enough to tell apart physically distinct rooms that
	// happen to share a title (e.g. Cutthroats' "Wharf Road" covers 5 different
	// street segments). The title-keyed path (used by the player for any
	// release other than the exact one rooms.json was built from) is never a
	// separate generation: it's just a local copy of whichever room with that
	// title got processed first, and is left alone once it exists — so two
	// rooms sharing a title never cost two API calls.
	imageDir := filepath.Join(*outDir, gameName)
	idDir := filepath.Join(imageDir, "id")
	if err := os.MkdirAll(idDir, 0755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}

	idPath := func(room RoomEntry) string {
		return filepath.Join(idDir, fmt.Sprintf("%d.webp", room.RoomID))
	}
	// effectiveTitle mirrors generate()'s resolvedTitle/effectiveTitle chain
	// in player/js/imagegen/index.js — same two per-game overrides, applied
	// in the same order, used for both the title-keyed filename and the
	// prompt's scene name (see buildPrompt below).
	effectiveTitle := func(room RoomEntry) string {
		return normalizeDynamicTitle(gameName, resolveTitle(gameName, room.Title, room.Description))
	}
	namePath := func(room RoomEntry) string {
		return filepath.Join(imageDir, slugify(effectiveTitle(room))+".webp")
	}
	copyIfMissing := func(src, dst string) {
		if _, err := os.Stat(dst); err == nil {
			return
		}
		data, err := os.ReadFile(src)
		if err != nil {
			log.Printf("ERROR copy %s -> %s: read: %v", src, dst, err)
			return
		}
		if err := os.WriteFile(dst, data, 0644); err != nil {
			log.Printf("ERROR copy %s -> %s: write: %v", src, dst, err)
		}
	}

	type job struct{ room RoomEntry }
	jobs := make(chan job, len(rooms))

	queued, skipped, tooShort := 0, 0, 0
	for _, room := range rooms {
		if _, err := os.Stat(idPath(room)); err == nil {
			skipped++
			copyIfMissing(idPath(room), namePath(room))
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
				prompt := buildPrompt(room.GameID, effectiveTitle(room), room.Description)

				log.Printf("generating [%d] %s", room.RoomID, room.Title)

				img, err := callAPI(*apiKey, *model, prompt, refs)
				if err != nil {
					log.Printf("ERROR [%d] %s: %v", room.RoomID, room.Title, err)
					continue
				}

				f, err := os.Create(idPath(room))
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
				copyIfMissing(idPath(room), namePath(room))
				done.Add(1)
				log.Printf("done [%d] %s", room.RoomID, room.Title)
			}
		}()
	}

	wg.Wait()
	log.Printf("all done — %d images generated", done.Load())
}
