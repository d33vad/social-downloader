const express = require('express');
const cors = require('cors');
const path = require('path');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = 3000;

// Create downloads directory
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Find yt-dlp executable
function getYtDlpPath() {
    // Use python module and ffmpeg-static for reliable execution
    return `python -m yt_dlp --ffmpeg-location "${ffmpegPath}"`;
}

const YT_DLP = getYtDlpPath();

// Detect platform from URL
function detectPlatform(url) {
    const platforms = {
        'tiktok.com': { name: 'TikTok', icon: '🎵', color: '#00f2ea' },
        'vm.tiktok.com': { name: 'TikTok', icon: '🎵', color: '#00f2ea' },
        'instagram.com': { name: 'Instagram', icon: '📸', color: '#e4405f' },
        'twitter.com': { name: 'Twitter/X', icon: '🐦', color: '#1da1f2' },
        'x.com': { name: 'Twitter/X', icon: '🐦', color: '#1da1f2' },
        'youtube.com': { name: 'YouTube', icon: '▶️', color: '#ff0000' },
        'youtu.be': { name: 'YouTube', icon: '▶️', color: '#ff0000' },
        'facebook.com': { name: 'Facebook', icon: '👤', color: '#1877f2' },
        'fb.watch': { name: 'Facebook', icon: '👤', color: '#1877f2' },
        'pinterest.com': { name: 'Pinterest', icon: '📌', color: '#e60023' },
        'reddit.com': { name: 'Reddit', icon: '🤖', color: '#ff4500' },
        'vimeo.com': { name: 'Vimeo', icon: '🎬', color: '#1ab7ea' },
        'twitch.tv': { name: 'Twitch', icon: '🎮', color: '#9146ff' },
        'snapchat.com': { name: 'Snapchat', icon: '👻', color: '#fffc00' },
        'dailymotion.com': { name: 'Dailymotion', icon: '📺', color: '#0066dc' },
        'soundcloud.com': { name: 'SoundCloud', icon: '🎧', color: '#ff5500' }
    };

    for (const [domain, info] of Object.entries(platforms)) {
        if (url.includes(domain)) {
            return { key: domain, ...info };
        }
    }
    return { key: 'unknown', name: 'Unknown', icon: '🔗', color: '#6366f1' };
}

// Execute command and return output
function runCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || stdout || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}

// API endpoint to analyze URL
app.post('/api/analyze', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const platform = detectPlatform(url);
        console.log(`📊 Analyzing: ${url}`);

        // Get video info using yt-dlp
        const command = `${YT_DLP} -J --no-playlist "${url}"`;
        const output = await runCommand(command, DOWNLOADS_DIR);
        const info = JSON.parse(output);

        // Process formats
        const formats = [];
        const seenQualities = new Set();

        if (info.formats && info.formats.length > 0) {
            // Filter video formats with audio included, or video-only with height
            const videoFormats = info.formats
                .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
                .sort((a, b) => (b.height || 0) - (a.height || 0));

            for (const f of videoFormats) {
                const quality = `${f.height}p`;
                if (seenQualities.has(quality)) continue;
                seenQualities.add(quality);

                const hasAudio = f.acodec && f.acodec !== 'none';
                const size = f.filesize ? formatFileSize(f.filesize) :
                    f.filesize_approx ? `~${formatFileSize(f.filesize_approx)}` : 'Unknown';

                formats.push({
                    id: f.format_id,
                    label: `Video ${quality}${hasAudio ? '' : ' (video only)'}`,
                    type: 'video',
                    quality,
                    size,
                    ext: f.ext || 'mp4',
                    hasAudio
                });

                if (formats.length >= 5) break;
            }
        }

        // Add best quality option at the top
        formats.unshift({
            id: 'best',
            label: '🏆 Best Quality (Video + Audio)',
            type: 'video',
            quality: 'Best',
            size: 'Auto',
            ext: 'mp4',
            hasAudio: true
        });

        // Add audio only option
        formats.push({
            id: 'audio',
            label: '🎵 Audio Only (MP3)',
            type: 'audio',
            quality: 'Best Audio',
            size: 'Auto',
            ext: 'mp3',
            hasAudio: true
        });

        const duration = info.duration ? formatDuration(info.duration) : '';

        res.json({
            success: true,
            platform: platform.key,
            platformName: platform.name,
            platformIcon: platform.icon,
            platformColor: platform.color,
            url: url,
            title: info.title || 'Untitled',
            thumbnail: info.thumbnail || null,
            duration: duration,
            formats: formats
        });

    } catch (error) {
        console.error('Error analyzing URL:', error.message);
        res.status(500).json({
            error: 'Failed to analyze URL. Please check the URL and try again.',
            details: error.message
        });
    }
});

// API endpoint to download
app.post('/api/download', async (req, res) => {
    try {
        const { url, formatId, title } = req.body;

        if (!url || !formatId) {
            return res.status(400).json({ error: 'URL and format are required' });
        }

        console.log(`⬇️ Starting download: ${url} (format: ${formatId})`);

        // Get files before download to compare later
        const filesBefore = new Set(fs.readdirSync(DOWNLOADS_DIR));

        // Build yt-dlp command
        let command;

        if (formatId === 'audio') {
            // Audio only - download best audio and convert to MP3
            command = `${YT_DLP} --no-playlist -N 4 -x --audio-format mp3 --audio-quality 192K -o "%(title)s.%(ext)s" "${url}"`;
        } else if (formatId === 'best') {
            // Best quality - prioritize single file for speed (b), then merge if needed (bv*+ba)
            command = `${YT_DLP} --no-playlist -N 4 -f "b/bv*+ba" --merge-output-format mp4 -o "%(title)s.%(ext)s" "${url}"`;
        } else {
            // Specific format ID - usage concurrent fragments
            command = `${YT_DLP} --no-playlist -N 4 -f "${formatId}+ba/b" --merge-output-format mp4 -o "%(title)s.%(ext)s" "${url}"`;
        }

        console.log('Running:', command);
        await runCommand(command, DOWNLOADS_DIR);

        // Find newly created files
        const filesAfter = fs.readdirSync(DOWNLOADS_DIR);
        const newFiles = filesAfter
            .filter(f => !filesBefore.has(f) && !f.endsWith('.part') && !f.endsWith('.ytdl'))
            .map(f => ({
                name: f,
                fullPath: path.join(DOWNLOADS_DIR, f),
                stats: fs.statSync(path.join(DOWNLOADS_DIR, f))
            }))
            .sort((a, b) => b.stats.mtime - a.stats.mtime);

        if (newFiles.length > 0) {
            const downloadedFile = newFiles[0];
            console.log(`✅ Download complete: ${downloadedFile.name}`);

            res.json({
                success: true,
                message: 'Download complete!',
                filename: downloadedFile.name,
                downloadUrl: `/downloads/${encodeURIComponent(downloadedFile.name)}`,
                size: formatFileSize(downloadedFile.stats.size)
            });
        } else {
            // Maybe the file already existed, find most recent file
            const allFiles = fs.readdirSync(DOWNLOADS_DIR)
                .filter(f => !f.endsWith('.part') && !f.endsWith('.ytdl'))
                .map(f => ({
                    name: f,
                    fullPath: path.join(DOWNLOADS_DIR, f),
                    stats: fs.statSync(path.join(DOWNLOADS_DIR, f))
                }))
                .sort((a, b) => b.stats.mtime - a.stats.mtime);

            if (allFiles.length > 0) {
                const downloadedFile = allFiles[0];
                res.json({
                    success: true,
                    message: 'Download complete!',
                    filename: downloadedFile.name,
                    downloadUrl: `/downloads/${encodeURIComponent(downloadedFile.name)}`,
                    size: formatFileSize(downloadedFile.stats.size)
                });
            } else {
                throw new Error('Downloaded file not found');
            }
        }

    } catch (error) {
        console.error('Error downloading:', error.message);
        res.status(500).json({
            error: 'Failed to download. Please try again.',
            details: error.message
        });
    }
});

// Get download history
app.get('/api/history', (req, res) => {
    try {
        const files = fs.readdirSync(DOWNLOADS_DIR)
            .filter(f => !f.startsWith('.') && !f.endsWith('.part') && !f.endsWith('.ytdl'))
            .map(f => {
                const filePath = path.join(DOWNLOADS_DIR, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    size: formatFileSize(stats.size),
                    date: stats.mtime,
                    downloadUrl: `/downloads/${encodeURIComponent(f)}`
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 20);

        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get history' });
    }
});

// Helper functions
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Social Media Downloader running at http://localhost:${PORT}`);
    console.log(`📁 Downloads saved to: ${DOWNLOADS_DIR}`);
});
