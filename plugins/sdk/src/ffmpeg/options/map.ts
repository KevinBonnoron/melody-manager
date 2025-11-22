export function mapAudio(inputIndex = 0): string {
  return `${inputIndex}:a`;
}

export function mapVideo(inputIndex = 0): string {
  return `${inputIndex}:v`;
}

export function mapAll(inputIndex = 0): string {
  return `${inputIndex}`;
}

export function mapAudioStream(streamIndex: number, inputIndex = 0): string {
  return `${inputIndex}:a:${streamIndex}`;
}

export function mapVideoStream(streamIndex: number, inputIndex = 0): string {
  return `${inputIndex}:v:${streamIndex}`;
}
