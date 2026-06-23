# Decisions

This file records project decisions so future contributors and agents can understand why the repo is shaped the way it is.

## Project Unit

Decision: treat the project as a development environment, not just a playable template.

Reason: users need a place to ingest a story file, inspect it, curate room data, manage generated images, configure presentation, and export a finished web build.

## First Test Format

Decision: start with Z-machine/Z-code files.

Reason: Z-code is a classic IF format with existing tooling and interpreters. Zork is the first test case for validating the ingestion pipeline.

## First Parser

Decision: use ZTools `infodump` as the first inspection tool.

Reason: it can expose low-level Z-machine structures such as objects, properties, strings, and object tree relationships. It gives us a practical way to learn what is inside a story file before building higher-level room extraction.

## WASM Direction

Decision: compile C tooling with Emscripten and expose it to JavaScript.

Reason: both the builder and eventual player are browser-first. Using Emscripten lets us reuse mature C tools while keeping the user experience zero-install.

## Initial Output Strategy

Decision: start by capturing raw `printf` output from `infodump`.

Reason: this is the fastest proof of the browser-to-WASM-to-Z-code inspection loop. A structured JSON API can come after the pipeline is proven.

## Builder And Player Separation

Decision: keep builder-side analysis tools separate from the player runtime.

Reason: the builder needs inspection and authoring capabilities, while the exported player should be lean and focused on running the game.
