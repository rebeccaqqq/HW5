const NUM_FMT = (n) => +n.toFixed(4);

export const JSON_TOOL_DECLARATIONS = [
  {
    name: 'compute_stats_json',
    description:
      'Compute descriptive statistics (mean, median, std, min, max, count) for a numeric field in the loaded YouTube channel JSON.',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description:
            'Exact field name of a numeric property on each video object, e.g. "view_count", "like_count", "comment_count", or "duration".',
        },
      },
      required: ['field'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Prepare data for plotting any numeric metric (views, likes, comments, etc.) versus time (publish date) for the loaded channel videos.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_field: {
          type: 'STRING',
          description:
            'Numeric field to plot on the y-axis, e.g. "view_count", "like_count", "comment_count", or "duration".',
        },
        time_field: {
          type: 'STRING',
          description:
            'Field to use for the x-axis time dimension. Defaults to "published_at" if omitted.',
        },
      },
      required: ['metric_field'],
    },
  },
  {
    name: 'play_video',
    description:
      'Select a single YouTube video from the loaded channel JSON and return its metadata so the UI can render a clickable card that opens the video on YouTube.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title_query: {
          type: 'STRING',
          description:
            'Optional case-insensitive substring to match in the video title, e.g. "asbestos" or "black hole".',
        },
        index: {
          type: 'NUMBER',
          description:
            'Optional 1-based index of the video to play in the current dataset ordering (1 = first video).',
        },
        mode: {
          type: 'STRING',
          description:
            'Optional selector mode. Use "most_viewed" to pick the video with the highest view_count if no better selector is provided.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generateImage',
    description:
      'Generate an image based on a natural language prompt and (optionally) an anchor image the user dragged into the chat. The UI will display the returned image and allow the user to download or enlarge it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description:
            'Text description of the image to generate. Refer to the YouTube data or prior conversation for context when appropriate.',
        },
      },
      required: ['prompt'],
    },
  },
];

const numericValues = (items, field) =>
  items
    .map((v) => Number(v[field]))
    .filter((n) => typeof n === 'number' && !Number.isNaN(n));

const median = (sorted) =>
  sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

const normaliseField = (videos, requested) => {
  if (!videos.length || !requested) return requested;
  const keys = Object.keys(videos[0]);
  if (keys.includes(requested)) return requested;
  const norm = (s) => String(s).toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(requested);
  return keys.find((k) => norm(k) === target) || requested;
};

export const executeJsonTool = (toolName, args, videos, anchorImages = []) => {
  const items = Array.isArray(videos) ? videos : [];
  console.group(`[JSON Tool] ${toolName}`);
  console.log('args:', args);
  console.log('videos:', items.length);
  console.groupEnd();

  switch (toolName) {
    case 'compute_stats_json': {
      const requested = args.field;
      const field = normaliseField(items, requested);
      const vals = numericValues(items, field);
      if (!vals.length) {
        return {
          error: `No numeric values found for field "${field}". Available fields: ${items[0] ? Object.keys(items[0]).join(', ') : 'none'}`,
        };
      }
      const sorted = [...vals].sort((a, b) => a - b);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: NUM_FMT(mean),
        median: NUM_FMT(median(sorted)),
        std: NUM_FMT(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metricRequested = args.metric_field;
      const timeRequested = args.time_field || 'published_at';
      const metricField = normaliseField(items, metricRequested);
      const timeField = normaliseField(items, timeRequested);

      const points = items
        .map((v) => {
          const value = Number(v[metricField]);
          const rawDate = v[timeField];
          const d = rawDate ? new Date(rawDate) : null;
          if (!rawDate || !d || Number.isNaN(d.getTime()) || Number.isNaN(value)) return null;
          return {
            date: d.toISOString().slice(0, 10),
            value,
            title: v.title || '',
            video_id: v.video_id,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      if (!points.length) {
        return {
          error: `Could not build any points for metric "${metricField}" vs time "${timeField}". Check that both fields exist and are well-formed.`,
        };
      }

      return {
        _chartType: 'metric_vs_time',
        metricField,
        timeField,
        title: `${metricField} vs time`,
        data: points,
      };
    }

    case 'play_video': {
      if (!items.length) {
        return { error: 'No videos are loaded in the current JSON context.' };
      }
      const { title_query, index, mode } = args || {};
      let chosen = null;

      if (typeof index === 'number' && Number.isFinite(index)) {
        const idx = Math.max(1, Math.floor(index)) - 1;
        if (idx >= 0 && idx < items.length) {
          chosen = items[idx];
        }
      }

      if (!chosen && typeof title_query === 'string' && title_query.trim()) {
        const q = title_query.trim().toLowerCase();
        chosen =
          items.find((v) => String(v.title || '').toLowerCase().includes(q)) ||
          items.find((v) => String(v.description || '').toLowerCase().includes(q));
      }

      if (!chosen && mode === 'most_viewed') {
        chosen = items.reduce((best, v) => {
          const current = Number(v.view_count || 0);
          const bestVal = Number(best?.view_count || 0);
          return current > bestVal ? v : best;
        }, null);
      }

      if (!chosen) {
        chosen = items[0];
      }

      if (!chosen) {
        return { error: 'Unable to select a video from the dataset.' };
      }

      return {
        title: chosen.title || '',
        video_url:
          chosen.video_url || (chosen.video_id ? `https://www.youtube.com/watch?v=${chosen.video_id}` : null),
        thumbnail_url: chosen.thumbnail_url || null,
        view_count: Number(chosen.view_count || 0),
        like_count: Number(chosen.like_count || 0),
        comment_count: Number(chosen.comment_count || 0),
        published_at: chosen.published_at || '',
      };
    }

    case 'generateImage': {
      const prompt = String(args.prompt || '').trim();
      const anchorCount = Array.isArray(anchorImages) ? anchorImages.length : 0;
      if (!prompt) {
        return { error: 'Prompt is required to generate an image.' };
      }

      // This project does not perform image generation directly in the browser.
      // Instead, we return a structured payload that the UI can display, and
      // a future backend or client integration can fill in real image bytes.
      return {
        _type: 'generated_image',
        prompt,
        anchorImageCount: anchorCount,
        message:
          'Image generation is configured as a tool. The UI can render or fetch an image for this prompt using this payload.',
      };
    }

    default:
      return { error: `Unknown JSON tool: ${toolName}` };
  }
};

