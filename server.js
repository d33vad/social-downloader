const express = require('express');
const cors = require('cors');
const path = require('path');
const { execSync, exec, spawn } = require('child_process');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = 3000;

// Track active downloads for progress monitoring
const activeDownloads = new Map();

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
// Find yt-dlp executable
function getYtDlpPath() {
    // Use local binary downloaded by install-binary.js
    const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const binaryPath = path.join(__dirname, 'bin', fileName);

    // Fallback: If local binary doesn't exist (dev env maybe?), try global or python module
    if (!fs.existsSync(binaryPath)) {
        console.warn('⚠️ Local yt-dlp binary not found in ./bin, falling back to python module');
        return `python -m yt_dlp --ffmpeg-location "${ffmpegPath}" --force-ipv4`;
    }

    // Quote path for safety
    return `"${binaryPath}" --ffmpeg-location "${ffmpegPath}" --force-ipv4`;
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
        // -J: dump JSON
        // --no-playlist: only single video
        // --no-warnings: silence stderr to improve parsing speed
        const command = `${YT_DLP} -J --no-playlist --no-warnings "${url}"`;
        console.time('yt-dlp-analysis');
        const output = await runCommand(command, DOWNLOADS_DIR);
        console.timeEnd('yt-dlp-analysis');
        const info = JSON.parse(output);

        // Process formats
        const formats = [];
        const seenQualities = new Set();

        // Optimistic processing: some sites return formats in a weird order
        // We sort by height (quality) descending
        if (info.formats) {
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

        const downloadId = Date.now().toString();
        console.log(`⬇️ Starting download: ${url} (format: ${formatId}, ID: ${downloadId})`);

        // Initialize progress tracking
        activeDownloads.set(downloadId, {
            progress: 0,
            status: 'initializing',
            speed: '0 KB/s',
            eta: 'calculating...',
            downloaded: '0 MB',
            total: '0 MB'
        });

        const outputTemplate = `${downloadId}_%(title)s.%(ext)s`;

        // Build yt-dlp command arguments
        let formatArg;
        let extraArgs = [];

        if (formatId === 'audio') {
            formatArg = 'bestaudio';
            extraArgs = ['-x', '--audio-format', 'mp3', '--audio-quality', '192K'];
        } else if (formatId === 'best') {
            formatArg = 'b/bv*+ba';
            extraArgs = ['--merge-output-format', 'mp4'];
        } else {
            formatArg = `${formatId}+ba/b`;
            extraArgs = ['--merge-output-format', 'mp4'];
        }

        // Get yt-dlp path
        const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        const ytdlpPath = path.join(__dirname, 'bin', fileName);

        const args = [
            '--newline', // Progress on new lines for easier parsing
            '--no-playlist',
            '-N', '8',
            '--no-mtime',
            '--restrict-filenames',
            '--trim-filenames', '100',
            '--ffmpeg-location', ffmpegPath,
            '--force-ipv4',
            '-f', formatArg,
            ...extraArgs,
            '-o', outputTemplate,
            url
        ];

        // Send initial response with download ID
        res.json({
            success: true,
            downloadId: downloadId,
            message: 'Download started'
        });

        // Spawn yt-dlp process
        const ytdlp = spawn(ytdlpPath, args, { cwd: DOWNLOADS_DIR });

        let outputBuffer = '';

        ytdlp.stdout.on('data', (data) => {
            outputBuffer += data.toString();
            const lines = outputBuffer.split('\n');
            outputBuffer = lines.pop(); // Keep incomplete line in buffer

            lines.forEach(line => {
                // Parse progress from yt-dlp output
                // Format: [download]  45.2% of 125.5MiB at 2.5MiB/s ETA 00:25
                const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)(?:\s+ETA\s+(\d+:\d+))?/);

                if (progressMatch) {
                    const progress = parseFloat(progressMatch[1]);
                    const total = progressMatch[2];
                    const speed = progressMatch[3];
                    const eta = progressMatch[4] || 'calculating...';

                    activeDownloads.set(downloadId, {
                        progress: Math.min(progress, 100),
                        status: 'downloading',
                        speed: speed,
                        eta: eta,
                        downloaded: `${(progress / 100 * parseFloat(total)).toFixed(1)}${total.replace(/[\d.]/g, '')}`,
                        total: total
                    });
                }

                // Check for merge/conversion status
                if (line.includes('[Merger]') || line.includes('[ExtractAudio]')) {
                    activeDownloads.set(downloadId, {
                        ...activeDownloads.get(downloadId),
                        status: 'converting',
                        progress: 95
                    });
                }
            });
        });

        ytdlp.stderr.on('data', (data) => {
            console.error(`yt-dlp stderr: ${data}`);
        });

        ytdlp.on('close', (code) => {
            if (code === 0) {
                // Find the downloaded file
                const files = fs.readdirSync(DOWNLOADS_DIR);
                const downloadedFile = files.find(f => f.startsWith(downloadId));

                if (downloadedFile) {
                    const fullPath = path.join(DOWNLOADS_DIR, downloadedFile);
                    const stats = fs.statSync(fullPath);
                    const cleanName = downloadedFile.substring(downloadId.length + 1);

                    activeDownloads.set(downloadId, {
                        progress: 100,
                        status: 'complete',
                        filename: cleanName,
                        actualFilename: downloadedFile,
                        downloadUrl: `/downloads/${encodeURIComponent(downloadedFile)}`,
                        size: formatFileSize(stats.size)
                    });

                    console.log(`✅ Download complete: ${downloadedFile}`);

                    // Clean up after 5 minutes
                    setTimeout(() => {
                        activeDownloads.delete(downloadId);
                    }, 5 * 60 * 1000);
                } else {
                    activeDownloads.set(downloadId, {
                        progress: 0,
                        status: 'error',
                        error: 'Downloaded file not found'
                    });
                }
            } else {
                activeDownloads.set(downloadId, {
                    progress: 0,
                    status: 'error',
                    error: `Download failed with code ${code}`
                });
            }
        });

    } catch (error) {
        console.error('Error starting download:', error.message);
        res.status(500).json({
            error: 'Failed to start download. Please try again.',
            details: error.message
        });
    }
});

// Get download progress
app.get('/api/progress/:downloadId', (req, res) => {
    const { downloadId } = req.params;
    const progress = activeDownloads.get(downloadId);

    if (progress) {
        res.json({ success: true, ...progress });
    } else {
        res.json({ success: false, error: 'Download not found' });
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
