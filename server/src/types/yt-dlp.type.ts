export interface YtDlpChapter {
  title: string;
  start_time: number;
  end_time: number;
}

export interface YtDlpComment {
  id: string;
  parent: string;
  text: string;
}

type YtDlpTrackInfoFormatExt = 'mhtml' | 'm4a' | 'webm' | 'mp4';

interface YtDlpTrackInfoFormat {
  ext: YtDlpTrackInfoFormatExt;
}

export interface YtDlpTrackInfo {
  upload_date?: string;
  title: string;
  duration: number;
  uploader: string;
  channel?: string;
  album?: string;
  artist?: string;
  webpage_url: string;
  thumbnail?: string;
  format: YtDlpTrackInfoFormat[];
  ext: YtDlpTrackInfoFormatExt;
  tbr: number;
  chapters?: YtDlpChapter[];
  description?: string;
  comments?: YtDlpComment[];
  id?: string;
  url?: string;
  [key: string]: unknown;
}
