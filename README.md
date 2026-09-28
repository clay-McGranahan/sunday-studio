# Sunday Studio

Desktop app that turns full-length sermon recordings into short, captioned clips for social media. See [DESIGN.md](DESIGN.md) for the product design.

## Running it

```bash
npm install
npm run dev        # builds the speaker tracker, then starts the app with hot reload
npm run dist       # packaged macOS .dmg (electron-builder)
```

On first launch, the welcome screen checks for and installs what's missing:

| Piece | What it is | Installed to |
|---|---|---|
| FFmpeg (with libass) | reading video, cropping, burning captions | Homebrew (`brew install ffmpeg`) |
| Python 3.10+ | runs the transcription sidecar | system / Homebrew |
| Parakeet | NVIDIA Parakeet TDT 0.6B v3 via `parakeet-mlx` (Apple MLX) | private venv in the app data folder |
| Transcription model | `mlx-community/parakeet-tdt-0.6b-v3` | Hugging Face cache, used offline after |
| Speaker tracker | Swift + Apple Vision person/face detection | `resources/bin/sunday-tracker` |

AI clip suggestions are optional and use any OpenAI-compatible API (OpenRouter by default; OpenAI, or a custom base URL such as a local llama.cpp / Ollama server). The API key is stored encrypted with the macOS keychain via Electron `safeStorage`.

## How it fits together

```
src/main/        Electron main process
  pipeline.ts    import → probe → extract 16 kHz audio → Parakeet sidecar → transcript.json
  ai.ts          sentence-numbered transcript → OpenAI-compatible chat → ranked suggestions
  tracking.ts    runs sunday-tracker, picks the speaker, smooths a virtual camera path
  render.ts      ffmpeg: seek → sendcmd-driven crop → scale → ASS captions → H.264/AAC MP4
  setup.ts       readiness checks + installers for the welcome/settings screens
  index.ts       window + sunday-media:// protocol (range requests, so multi-GB videos seek)
src/shared/      types, paragraph/sentence/caption paging, crop geometry (shared by preview and render)
src/renderer/    React UI: projects, 4-step editor, clip library, settings
resources/python/transcribe.py   Parakeet sidecar (JSON-lines progress on stdout)
resources/swift/Tracker.swift    Apple Vision tracker (JSON lines on stdout)
```

Projects live in the app data folder (`~/Library/Application Support/Sunday Studio/projects/<id>/`): `project.json`, `transcript.json` and a thumbnail. The sermon video stays where the user keeps it and is referenced by path.

The preview (`FramedPlayer`) and the renderer share `src/shared/framing.ts` and `src/shared/transcript.ts`, so what you see while framing and captioning matches the exported file.

## Development notes

- `SUNDAY_USER_DATA=/path` runs against an isolated data folder.
- `SUNDAY_EXPORT_DIR=/path` skips the save dialog when rendering (for automated tests).
- Measured on an Apple Silicon Mac with a 33-minute 1080p sermon: transcription ≈ 65 s (model cached), tracking ≈ 1–2 s per 30 s of clip, rendering a 30 s 9:16 clip ≈ 3–6 s.

## Platforms

macOS (Apple Silicon) today. Windows and Linux need replacements for the two Apple-only pieces — `parakeet-mlx` (MLX) and the Vision tracker — see DESIGN.md.

## License

MIT, see [LICENSE](LICENSE). The bundled caption fonts (Figtree, Archivo Black, Literata) are under the SIL Open Font License; their license texts are in `resources/fonts/`. The Parakeet model is downloaded at setup from Hugging Face under its own license (CC-BY-4.0).
