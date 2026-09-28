"""Sunday Studio transcription sidecar (NVIDIA Parakeet via parakeet-mlx).

Usage: transcribe.py <audio.wav> <out.json> [model_id]

Writes JSON-lines progress events to stdout and the word-level transcript
to <out.json> as {"words": [{"text", "start", "end", "confidence"}], "duration"}.
"""

import json
import sys


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def tokens_to_words(sentences) -> list[dict]:
    words: list[dict] = []
    # Parakeet sometimes emits the space as its own token (e.g. " ", "2", "7"),
    # so a whitespace-only token marks the start of the next word.
    pending_space = True
    for sentence in sentences:
        for token in sentence.tokens:
            text = token.text
            piece = text.strip()
            if not piece:
                pending_space = True
                continue
            starts_word = pending_space or text[:1].isspace() or not words
            pending_space = text[-1:].isspace()
            if starts_word:
                words.append({
                    "text": piece,
                    "start": round(token.start, 3),
                    "end": round(token.end, 3),
                    "confidence": round(float(token.confidence), 3),
                })
            else:
                last = words[-1]
                last["text"] += piece
                last["end"] = round(token.end, 3)
                last["confidence"] = round(min(last["confidence"], float(token.confidence)), 3)
    return words


def main() -> None:
    if len(sys.argv) < 3:
        emit({"type": "error", "message": "usage: transcribe.py <audio> <out.json> [model]"})
        sys.exit(2)
    audio, out_path = sys.argv[1], sys.argv[2]
    model_id = sys.argv[3] if len(sys.argv) > 3 else "mlx-community/parakeet-tdt-0.6b-v3"

    emit({"type": "stage", "message": "Loading Parakeet model"})
    from parakeet_mlx import from_pretrained

    model = from_pretrained(model_id)
    emit({"type": "stage", "message": "Transcribing"})

    def on_chunk(done: int, total: int) -> None:
        emit({"type": "progress", "value": done / max(total, 1)})

    result = model.transcribe(audio, chunk_duration=120.0, overlap_duration=15.0, chunk_callback=on_chunk)
    words = tokens_to_words(result.sentences)
    duration = words[-1]["end"] if words else 0.0
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"model": model_id, "words": words, "duration": duration}, f)
    emit({"type": "done", "words": len(words)})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # surface a plain-language failure to the app
        emit({"type": "error", "message": str(exc)})
        sys.exit(1)
