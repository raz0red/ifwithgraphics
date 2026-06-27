package frotz

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

const markerPrefix = "<<<IFWG:"
const markerSuffix = ">>>"
const readyMarker  = "<<<IFWG_READY>>>"

type Room struct {
	ID          int
	Title       string
	Description string
}

type Session struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
}

func NewSession(dfrotz, story string, rawLog io.Writer) (*Session, error) {
	cmd := exec.Command(dfrotz, "-w", "200", "-h", "100", story)
	cmd.Stderr = os.Stderr

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start dfrotz: %w", err)
	}

	var r io.Reader = stdout
	if rawLog != nil {
		r = io.TeeReader(stdout, rawLog)
	}
	return &Session{
		cmd:    cmd,
		stdin:  stdin,
		reader: bufio.NewReader(r),
	}, nil
}

// Next blocks until frotz emits the next room marker and description.
// Marker format: <<<IFWG:42:West of House>>> or <<<IFWG:West of House>>> (legacy).
func (s *Session) Next() (*Room, error) {
	var id int
	var title string

	for {
		line, err := s.reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, markerPrefix) && strings.HasSuffix(line, markerSuffix) {
			inner := line[len(markerPrefix) : len(line)-len(markerSuffix)]
			// Try numeric ID prefix: "42:West of House"
			if idx := strings.Index(inner, ":"); idx > 0 {
				if n, err := strconv.Atoi(inner[:idx]); err == nil {
					id = n
					title = inner[idx+1:]
					break
				}
			}
			// Legacy format: no numeric prefix
			title = inner
			break
		}
		if err == io.EOF {
			return nil, io.EOF
		}
		if err != nil {
			return nil, err
		}
	}

	var desc strings.Builder
	for {
		line, err := s.reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if line == readyMarker {
			break
		}
		if desc.Len() > 0 {
			desc.WriteByte('\n')
		}
		desc.WriteString(line)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
	}

	return &Room{
		ID:          id,
		Title:       title,
		Description: strings.TrimSpace(desc.String()),
	}, nil
}

// Send writes a command to frotz stdin.
func (s *Session) Send(command string) error {
	_, err := fmt.Fprintf(s.stdin, "%s\n", command)
	return err
}

// Close shuts down the frotz process.
func (s *Session) Close() {
	s.stdin.Close()
	s.cmd.Wait()
}
