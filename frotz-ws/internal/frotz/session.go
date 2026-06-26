package frotz

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
)

const markerPrefix = "<<<IFWG:"
const markerSuffix = ">>>"
const readyMarker  = "<<<IFWG_READY>>>"

type Room struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type Session struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader *bufio.Reader
}

func NewSession(dfrotz, story string) (*Session, error) {
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

	return &Session{
		cmd:    cmd,
		stdin:  stdin,
		reader: bufio.NewReader(stdout),
	}, nil
}

// Next blocks until frotz emits the next room marker and description.
// Returns nil, io.EOF when the process exits cleanly.
func (s *Session) Next() (*Room, error) {
	var title string

	// scan output until we see <<<IFWG:title>>>
	for {
		line, err := s.reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, markerPrefix) && strings.HasSuffix(line, markerSuffix) {
			title = line[len(markerPrefix) : len(line)-len(markerSuffix)]
			break
		}
		if err == io.EOF {
			return nil, io.EOF
		}
		if err != nil {
			return nil, err
		}
	}

	// collect description lines until <<<IFWG_READY>>>
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
