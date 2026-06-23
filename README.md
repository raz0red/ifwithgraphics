# ifwithgraphics

**ifwithgraphics** is an early-stage concept for bringing graphics back to classic interactive fiction.

The idea is simple: take a traditional text adventure, such as a Z-machine/Z-code game, and present it as a standalone web experience with generated room artwork, retro styling, and a familiar command-line interface.

Instead of calling AI services while someone is playing, the project is intended to generate images ahead of time during an authoring step. The finished game can then be packaged as static files and shared like any other web project.

## Concept

Classic interactive fiction is rich, strange, and deeply atmospheric, but it is usually presented as text only. ifwithgraphics explores what happens when those worlds are illustrated without losing the feel of the original parser-based experience.

The target style is retro rather than photorealistic: low-color palettes, pixel-inspired compositions, dithered images, simple frames, and a screen layout that feels closer to early graphical text adventures than modern game UI.

## Goals

- Turn existing interactive fiction stories into illustrated web experiences.
- Keep the original text adventure interaction at the center.
- Generate room art before release, not during play.
- Export games as simple static bundles that are easy to host.
- Support multiple presentation styles, from pure text to full retro graphics.
- Make the authoring process approachable for people who are not engine programmers.

## Basic Workflow

1. Load a Z-code story file.
2. Identify the major rooms or locations.
3. Generate artwork for those locations.
4. Review and adjust the visual style.
5. Export a playable web version of the game.
6. Host it on a static site provider, itch.io, GitHub Pages, or similar.

## Possible Display Modes

- **Text only**: the original interactive fiction experience.
- **Retro graphics**: illustrated room art with an 8-bit inspired look.
- **Modern illustrated**: cleaner, higher-resolution generated scenes.

## Status

This repository is currently a starting point for the project concept. Implementation details, build tooling, and runtime architecture will be added as the idea develops.

## License

License information has not been finalized yet.
