import { useState } from 'react';
import './YouTubeChannelDownload.css';

const MAX_VIDEOS = 100;

export default function YouTubeChannelDownload({ username, displayName }) {
  const [channelUrl, setChannelUrl] = useState('');
  const [maxVideos, setMaxVideos] = useState(10);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    const trimmedUrl = channelUrl.trim();
    if (!trimmedUrl) {
      setStatus('Please enter a YouTube channel URL.');
      return;
    }
    const count = Math.min(Math.max(1, Number(maxVideos) || 10), MAX_VIDEOS);
    setLoading(true);
    setStatus('Starting download…');
    setProgress(10);
    try {
      const res = await fetch('/api/youtube/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: trimmedUrl, maxVideos: count }),
      });
      setProgress(50);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to download channel data.');
      }
      const videos = data.videos || [];
      const payload = {
        channel: data.channel || null,
        videos,
        downloadedBy: {
          username,
          name: displayName || username,
          downloadedAt: new Date().toISOString(),
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName =
        data.channel?.handle ||
        data.channel?.title ||
        trimmedUrl.replace(/https?:\/\//, '').replace(/[^\w.@-]+/g, '_');
      a.href = url;
      a.download = `channel_${safeName}_${count}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setProgress(100);
      setStatus(`Downloaded ${videos.length} videos.`);
    } catch (err) {
      setStatus(err.message || 'Something went wrong while downloading channel data.');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="yt-download">
      <div className="yt-card">
        <h2 className="yt-title">YouTube Channel Download</h2>
        <p className="yt-subtitle">
          Paste a channel URL and download structured JSON for use in the chat.
        </p>

        <label className="yt-label">
          Channel URL
          <input
            type="url"
            placeholder="https://www.youtube.com/@veritasium"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={loading}
          />
        </label>

        <label className="yt-label inline">
          Max videos
          <input
            type="number"
            min={1}
            max={MAX_VIDEOS}
            value={maxVideos}
            onChange={(e) => setMaxVideos(e.target.value)}
            disabled={loading}
          />
          <span className="yt-label-hint">(1–100, default 10)</span>
        </label>

        <button
          type="button"
          className="yt-download-btn"
          onClick={handleDownload}
          disabled={loading}
        >
          {loading ? 'Downloading…' : 'Download Channel Data'}
        </button>

        <div className="yt-progress-wrapper">
          <div className="yt-progress-bar">
            <div className="yt-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="yt-status">{status}</div>
        </div>

        <p className="yt-footer">
          Tip: After downloading, you can drag the JSON file into the chat to analyze the channel.
        </p>
      </div>
    </div>
  );
}

