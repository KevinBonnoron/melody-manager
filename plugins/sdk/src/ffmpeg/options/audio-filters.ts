interface AapAudioFilter {
  type: 'aap';
  order: number;
  projection: 'mono' | 'stereo';
  mu: number;
  delta: number;
  out_mode: 'i' | 'd' | 'o' | 'n' | 'e';
  precision: 'auto' | 'float' | 'double';
}

interface SilenceDetectFilter {
  type: 'silencedetect';
  noise: number;
  duration: number;
}

interface VolumeFilter {
  type: 'volume';
  volume: number;
  precision?: 'auto' | 'fixed' | 'float' | 'double';
  eval?: 'once' | 'frame';
}

interface AStatsFilter {
  type: 'astats';
  length?: number;
  metadata?: 0 | 1;
  reset?: number;
}

interface LoudNormFilter {
  type: 'loudnorm';
  I?: number;
  TP?: number;
  LRA?: number;
  print_format?: 'none' | 'json' | 'summary';
  linear?: boolean;
}

interface AResampleFilter {
  type: 'aresample';
  sample_rate: number;
}

export type AudioFilter = AapAudioFilter | SilenceDetectFilter | VolumeFilter | AStatsFilter | LoudNormFilter | AResampleFilter;
export type AudioFilterType = AudioFilter['type'];

export function serializeAudioFilter(filter: AudioFilter): string[] {
  let filterString: string;

  switch (filter.type) {
    case 'aap':
      filterString = `aap=order=${filter.order}:projection=${filter.projection}:mu=${filter.mu}:delta=${filter.delta}:out_mode=${filter.out_mode}:precision=${filter.precision}`;
      break;
    case 'silencedetect':
      filterString = `silencedetect=n=${filter.noise}dB:d=${filter.duration}`;
      break;
    case 'volume': {
      filterString = `volume=${filter.volume}`;
      if (filter.precision) filterString += `:precision=${filter.precision}`;
      if (filter.eval) filterString += `:eval=${filter.eval}`;
      break;
    }
    case 'astats': {
      const str = 'astats';
      const params: string[] = [];
      if (filter.length !== undefined) params.push(`length=${filter.length}`);
      if (filter.metadata !== undefined) params.push(`metadata=${filter.metadata}`);
      if (filter.reset !== undefined) params.push(`reset=${filter.reset}`);
      filterString = params.length > 0 ? `${str}=${params.join(':')}` : str;
      break;
    }
    case 'loudnorm': {
      const params: string[] = [];
      if (filter.I !== undefined) params.push(`I=${filter.I}`);
      if (filter.TP !== undefined) params.push(`TP=${filter.TP}`);
      if (filter.LRA !== undefined) params.push(`LRA=${filter.LRA}`);
      if (filter.print_format) params.push(`print_format=${filter.print_format}`);
      if (filter.linear !== undefined) params.push(`linear=${filter.linear ? 'true' : 'false'}`);
      filterString = params.length > 0 ? `loudnorm=${params.join(':')}` : 'loudnorm';
      break;
    }
    case 'aresample':
      filterString = `aresample=${filter.sample_rate}`;
      break;
    default: {
      const _exhaustive: never = filter;
      throw new Error(`Unknown filter type: ${JSON.stringify(_exhaustive)}`);
    }
  }

  return ['-af', filterString];
}
