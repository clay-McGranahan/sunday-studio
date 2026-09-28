# Sunday Studio — Product Design

## What it is

Sunday Studio is a desktop app that helps churches turn full-length sermon recordings into short, captioned video clips for social media.

A sermon is usually 30–60+ minutes long, but the moments people share online are 20–60 seconds. Finding those moments, cutting them, reframing them for a phone screen, and adding captions is slow, repetitive editing work. Sunday Studio makes it quick enough that a church volunteer or staff member without video-editing experience can do it.

The core idea is **transcript-first editing**: instead of scrubbing through a video timeline, you read the sermon as text and select the words you want. The words you highlight become the clip.

## Who it's for

- Church communications staff and media volunteers
- Pastors who want to share their own messages online
- Small teams without a dedicated video editor or budget for editing services

## Guiding principles

- **Private by default.** Sermon video and audio stay on the user's computer. Only the transcript text is sent out, and only when the user asks for AI clip suggestions.
- **Text is the interface.** People find and pick moments by reading, not by scrubbing a timeline.
- **A guided path.** Work moves through four clear steps, so the user always knows what comes next.
- **Faithful to the message.** Clips are real, uncut moments from the sermon; the AI suggests moments but never rewrites what was said.
- **Works offline.** Transcription, framing, and exporting all work without an internet connection. Only AI suggestions need one.

## What users can do

### 1. Bring in a sermon

- Drag in or choose a sermon video (MP4, MOV, or WebM, up to about 3 hours).
- See progress while the video is prepared and transcribed.
- Get a word-by-word transcript with every word tied to its moment in the video.

### 2. Read, correct, and choose a moment

- Read the whole sermon as a transcript broken into timestamped paragraphs.
- Click a paragraph's timestamp to jump to that point in the video.
- **Select a clip by dragging across words.** The selection sets where the clip starts and ends.
- Fine-tune the selection by dragging its start and end handles.
- See the length of the selection (start, end, duration, word count) as it changes.
- Preview the selection in a small player; playback stops at the end of the selection. Switch to fullscreen to watch freely.
- **Fix transcription mistakes** by double-clicking a word and retyping it (useful for names, places, and Scripture references). Save the corrections to the project.

### 3. Get AI suggestions for clips (optional)

- Describe what you're looking for in plain language, such as "hope after loss" or "the strongest self-contained moments for social media".
- Get a short ranked list of suggested moments. Each has a title, a reason it works, a match score, and its time range.
- Click a suggestion to select it in the transcript, then adjust it by hand if needed.
- Suggestions lean toward complete thoughts with a strong opening, one clear idea, and a satisfying ending.

### 4. Frame the clip for the platform

- Choose an output shape:
  - **9:16** vertical for Reels, Shorts, and TikTok
  - **1:1** square for feed posts
  - **16:9** widescreen for YouTube
- **Track the speaker** so the pastor stays in frame when the video is cropped to a narrower shape, even if they move around the stage.
- Preview the framed result, including safe zones for platform overlays.

### 5. Add captions and export

- Choose a caption style:
  - **Clean**: clear and confident
  - **Punch**: bold and energetic, with fewer words on screen at a time
  - **Minimal**: quiet and editorial
- Captions are timed word by word to the speech and use the corrected transcript.
- Preview the caption look on the framed video.
- Render the finished clip (up to 3 minutes) and save it as an MP4, ready to post.

## Managing work

- **Projects:** every uploaded sermon is saved as a project. Users can browse, reopen, rename, and delete projects. Reopening a project brings back its transcript, corrections, and suggestions without processing the video again.
- **Clip library:** see all suggested moments for the current sermon in one place and jump back into editing any of them.
- **Status at a glance:** project cards show processing status, file size, and whether clips have been found.

## First-run setup and settings

- A welcome screen checks that the app is ready and helps the user download anything missing (the video-processing tools and the transcription model).
- Users can optionally connect an AI service for clip suggestions by entering an API key and, if they like, choosing a provider and model. A "Test connection" button confirms it works.
- Transcription, framing, and captioning work fully without an AI key. Only suggestions need one.
- The settings page shows whether each part of the app is ready and how many projects are stored locally.

## Feedback to the user

- Short pop-up messages confirm actions ("412 words transcribed", "5 moments found", "Clip rendered and downloaded") and explain failures in plain language.
- A startup screen shows while the app gets ready and offers a retry if something goes wrong.

## Platforms

- Available today as a native macOS app.
- Windows and Linux support is planned, using faster graphics hardware when available and falling back to the processor otherwise.

## Out of scope

- Full multi-track video editing (transitions, B-roll, music, color grading)
- Posting directly to social platforms
- Cloud hosting, team accounts, or collaboration
- Rewriting or summarizing what the speaker said
