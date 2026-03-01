require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { youtube_v3 } = require('@googleapis/youtube');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;
const youtube = new youtube_v3.Youtube({
  auth: process.env.YOUTUBE_API_KEY || '',
});

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : null,
      lastName: lastName ? String(lastName).trim() : null,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({
      ok: true,
      username: name,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube channel data ───────────────────────────────────────────────────────

app.post('/api/youtube/channel', async (req, res) => {
  try {
    const { channelUrl, maxVideos = 10 } = req.body || {};
    if (!channelUrl) return res.status(400).json({ error: 'channelUrl is required' });
    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YOUTUBE_API_KEY is not configured on the server.' });
    }

    const limit = Math.max(1, Math.min(100, Number(maxVideos) || 10));

    // Very simple handle extraction for URLs like https://www.youtube.com/@veritasium
    let handle = null;
    try {
      const u = new URL(channelUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      const atPart = parts.find((p) => p.startsWith('@'));
      if (atPart) handle = atPart.slice(1);
    } catch {
      // ignore URL parse errors
    }

    // Find channel via search when we have a handle or free-text query
    const searchResponse = await youtube.search.list({
      part: ['snippet'],
      type: ['channel'],
      q: handle || channelUrl,
      maxResults: 1,
    });
    const channelItem = searchResponse.data.items && searchResponse.data.items[0];
    if (!channelItem) {
      return res.status(404).json({ error: 'Channel not found for the provided URL.' });
    }
    const channelId = channelItem.snippet?.channelId || channelItem.id?.channelId;

    const channelResponse = await youtube.channels.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [channelId],
    });
    const fullChannel = channelResponse.data.items && channelResponse.data.items[0];
    if (!fullChannel) {
      return res.status(404).json({ error: 'Unable to load channel metadata.' });
    }

    const uploadsId = fullChannel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) {
      return res.status(500).json({ error: 'Channel uploads playlist not available.' });
    }

    const videos = [];
    let nextPageToken = undefined;
    while (videos.length < limit) {
      const remaining = limit - videos.length;
      const playlistResp = await youtube.playlistItems.list({
        part: ['snippet', 'contentDetails'],
        playlistId: uploadsId,
        maxResults: Math.min(50, remaining),
        pageToken: nextPageToken,
      });
      const items = playlistResp.data.items || [];
      if (!items.length) break;
      const ids = items
        .map((it) => it.contentDetails && it.contentDetails.videoId)
        .filter(Boolean);
      if (!ids.length) break;

      const videoResp = await youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: ids,
      });
      const videoItems = videoResp.data.items || [];
      for (const v of videoItems) {
        const s = v.snippet || {};
        const stats = v.statistics || {};
        const details = v.contentDetails || {};
        videos.push({
          video_id: v.id,
          title: s.title || '',
          description: s.description || '',
          transcript: null, // transcript fetching is optional and may require a separate API
          duration: details.duration || '',
          published_at: s.publishedAt || '',
          view_count: Number(stats.viewCount || 0),
          like_count: Number(stats.likeCount || 0),
          comment_count: Number(stats.commentCount || 0),
          video_url: `https://www.youtube.com/watch?v=${v.id}`,
          thumbnail_url: s.thumbnails?.high?.url || s.thumbnails?.default?.url || null,
        });
        if (videos.length >= limit) break;
      }

      nextPageToken = playlistResp.data.nextPageToken;
      if (!nextPageToken || videos.length >= limit) break;
    }

    const channelPayload = {
      id: fullChannel.id,
      title: fullChannel.snippet?.title || '',
      description: fullChannel.snippet?.description || '',
      handle: handle || null,
      customUrl: fullChannel.snippet?.customUrl || null,
      url: channelUrl,
      subscriber_count: Number(fullChannel.statistics?.subscriberCount || 0),
      video_count: Number(fullChannel.statistics?.videoCount || 0),
      view_count: Number(fullChannel.statistics?.viewCount || 0),
    };

    res.json({ channel: channelPayload, videos });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch YouTube channel data.' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
