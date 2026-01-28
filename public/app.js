// DOM Elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const platformBadge = document.getElementById('platformBadge');
const batchInfo = document.getElementById('batchInfo');
const resultsSection = document.getElementById('resultsSection');
const formatsList = document.getElementById('formatsList');
const downloadBtn = document.getElementById('downloadBtn');
const mediaTitle = document.getElementById('mediaTitle');
const mediaPlatform = document.getElementById('mediaPlatform');
const mediaDuration = document.getElementById('mediaDuration');
const mediaThumbnail = document.getElementById('mediaThumbnail');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');
const progressStatus = document.getElementById('progressStatus');
const progressSpeed = document.getElementById('progressSpeed');
const progressETA = document.getElementById('progressETA');
const toast = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');

// Theme Toggle Logic
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
});

function updateThemeIcon(theme) {
    themeToggle.textContent = theme === 'light' ? '☀️' : '🌙';
}

let selectedFormat = null;
let currentMediaInfo = null;
let currentDownloadId = null;
let progressInterval = null;
let urlQueue = [];
let isProcessing = false;

// Auto-resize textarea
urlInput.addEventListener('input', () => {
    urlInput.style.height = 'auto';
    urlInput.style.height = Math.min(urlInput.scrollHeight, 150) + 'px';

    const url = urlInput.value.trim();
    const urls = url.split('\n').filter(u => u.trim());

    if (urls.length > 1) {
        batchInfo.textContent = `📋 ${urls.length} URLs detected - Will process one at a time`;
        batchInfo.classList.remove('hidden');
    } else if (urls.length === 1) {
        batchInfo.classList.add('hidden');
        const platform = detectPlatform(urls[0]);
        updatePlatformBadge(platform);
    } else {
        batchInfo.classList.add('hidden');
        platformBadge.classList.add('hidden');
    }
});

// Platform detection patterns
const platformPatterns = {
    tiktok: { pattern: /tiktok\.com|vm\.tiktok\.com/i, name: 'TikTok', icon: '🎵', color: '#00f2ea' },
    instagram: { pattern: /instagram\.com/i, name: 'Instagram', icon: '📸', color: '#e4405f' },
    youtube: { pattern: /youtube\.com|youtu\.be/i, name: 'YouTube', icon: '▶️', color: '#ff0000' },
    twitter: { pattern: /twitter\.com|x\.com/i, name: 'Twitter/X', icon: '🐦', color: '#1da1f2' },
    facebook: { pattern: /facebook\.com|fb\.watch/i, name: 'Facebook', icon: '👤', color: '#1877f2' },
    pinterest: { pattern: /pinterest\.com|pin\.it/i, name: 'Pinterest', icon: '📌', color: '#e60023' },
    reddit: { pattern: /reddit\.com/i, name: 'Reddit', icon: '🤖', color: '#ff4500' },
    vimeo: { pattern: /vimeo\.com/i, name: 'Vimeo', icon: '🎬', color: '#1ab7ea' },
    twitch: { pattern: /twitch\.tv/i, name: 'Twitch', icon: '🎮', color: '#9146ff' },
    snapchat: { pattern: /snapchat\.com/i, name: 'Snapchat', icon: '👻', color: '#fffc00' },
    soundcloud: { pattern: /soundcloud\.com/i, name: 'SoundCloud', icon: '🎧', color: '#ff5500' },
    dailymotion: { pattern: /dailymotion\.com/i, name: 'Dailymotion', icon: '📺', color: '#0066dc' }
};

// Detect platform from URL
function detectPlatform(url) {
    for (const [key, platform] of Object.entries(platformPatterns)) {
        if (platform.pattern.test(url)) {
            return { key, ...platform };
        }
    }
    return null;
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastMessage = toast.querySelector('.toast-message');
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.className = 'toast hidden', 300);
    }, 4000);
}

// Update platform badge
function updatePlatformBadge(platform) {
    if (platform) {
        platformBadge.innerHTML = `${platform.icon} ${platform.name} <span style="color: ${platform.color}">✓ Detected</span>`;
        platformBadge.classList.remove('hidden');
    } else {
        platformBadge.classList.add('hidden');
    }
}

// Paste button handler
pasteBtn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        urlInput.value = text;
        urlInput.dispatchEvent(new Event('input'));
        showToast('Link(s) pasted!', 'success');
    } catch (err) {
        showToast('Failed to paste. Please paste manually.', 'error');
    }
});

// Analyze button handler
analyzeBtn.addEventListener('click', async () => {
    const urls = urlInput.value.trim().split('\n').filter(u => u.trim());

    if (urls.length === 0) {
        showToast('Please enter at least one URL', 'error');
        return;
    }

    if (urls.length > 1) {
        // Batch mode
        urlQueue = [...urls];
        isProcessing = true;
        showToast(`🚀 Processing ${urls.length} URLs...`, 'info');
        processNextUrl();
    } else {
        // Single URL
        await analyzeUrl(urls[0]);
    }
});

async function processNextUrl() {
    if (urlQueue.length === 0) {
        isProcessing = false;
        showToast('✅ All URLs processed!', 'success');
        return;
    }

    const url = urlQueue.shift();
    batchInfo.textContent = `⏳ Processing... (${urlQueue.length} remaining)`;
    await analyzeUrl(url);
}

async function analyzeUrl(url) {
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }

    // Show loading state
    const btnText = analyzeBtn.querySelector('.btn-text');
    const btnLoader = analyzeBtn.querySelector('.btn-loader');
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    analyzeBtn.disabled = true;
    resultsSection.classList.add('hidden');
    progressContainer.classList.add('hidden');

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (data.success) {
            currentMediaInfo = data;
            displayResults(data);
            showToast('Media found! Select a format to download.', 'success');

            // Update batch info if processing queue
            if (isProcessing && urlQueue.length > 0) {
                batchInfo.textContent = `✅ Ready to download (${urlQueue.length} more in queue)`;
            } else if (isProcessing) {
                batchInfo.classList.add('hidden');
                isProcessing = false;
            }
        } else {
            showToast(data.error || 'Failed to analyze URL', 'error');

            // Continue with next URL if in batch mode
            if (isProcessing && urlQueue.length > 0) {
                setTimeout(() => processNextUrl(), 1000);
            }
        }
    } catch (error) {
        showToast('Error connecting to server. Make sure the server is running.', 'error');
        console.error(error);

        // Continue with next URL if in batch mode
        if (isProcessing && urlQueue.length > 0) {
            setTimeout(() => processNextUrl(), 1000);
        }
    } finally {
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
}

// Display results
function displayResults(data) {
    mediaTitle.textContent = data.title;
    mediaPlatform.textContent = `${data.platformIcon} ${data.platformName}`;
    mediaPlatform.style.background = `${data.platformColor}20`;
    mediaPlatform.style.color = data.platformColor;
    mediaDuration.textContent = data.duration ? `⏱ ${data.duration}` : '';

    // Display thumbnail if available
    if (data.thumbnail) {
        mediaThumbnail.src = data.thumbnail;
        mediaThumbnail.classList.remove('hidden');
        mediaThumbnail.onerror = () => {
            mediaThumbnail.classList.add('hidden');
        };
    } else {
        mediaThumbnail.classList.add('hidden');
    }

    // Clear and populate formats
    formatsList.innerHTML = '';
    selectedFormat = null;
    downloadBtn.disabled = true;

    data.formats.forEach((format, index) => {
        const formatEl = document.createElement('div');
        formatEl.className = 'format-option';
        if (index === 0) formatEl.classList.add('recommended');
        formatEl.dataset.formatId = format.id;

        const icon = format.type === 'video' ? '🎬' :
            format.type === 'audio' ? '🎵' :
                format.type === 'image' ? '🖼️' : '📄';

        formatEl.innerHTML = `
            <div class="format-info">
                <div class="format-icon">${icon}</div>
                <div class="format-details">
                    <h4>${format.label}${index === 0 ? ' <span class="rec-badge">RECOMMENDED</span>' : ''}</h4>
                    <span>${format.quality} • ${format.ext?.toUpperCase() || 'MP4'}</span>
                </div>
            </div>
            <span class="format-size">${format.size}</span>
        `;

        formatEl.addEventListener('click', () => selectFormat(format, formatEl));
        formatsList.appendChild(formatEl);
    });

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Select format
function selectFormat(format, element) {
    document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedFormat = format;
    downloadBtn.disabled = false;
}

// Download button handler
downloadBtn.addEventListener('click', async () => {
    if (!selectedFormat || !currentMediaInfo) {
        showToast('Please select a format first', 'error');
        return;
    }

    downloadBtn.disabled = true;
    const originalContent = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<div class="spinner"></div> <span>Starting Download...</span>';

    showToast('⏳ Starting download...', 'info');

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentMediaInfo.url,
                formatId: selectedFormat.id,
                title: currentMediaInfo.title
            })
        });

        const data = await response.json();

        if (data.success && data.downloadId) {
            currentDownloadId = data.downloadId;

            // Show progress container
            progressContainer.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
            progressStatus.textContent = 'Initializing...';
            progressSpeed.textContent = '0 KB/s';
            progressETA.textContent = 'ETA: calculating...';

            // Start polling for progress
            startProgressPolling();
        } else {
            showToast(data.error || 'Failed to start download', 'error');
            downloadBtn.innerHTML = originalContent;
            downloadBtn.disabled = false;
        }
    } catch (error) {
        showToast('Error starting download. Please try again.', 'error');
        console.error(error);
        downloadBtn.innerHTML = originalContent;
        downloadBtn.disabled = false;
    }
});

// Progress polling
function startProgressPolling() {
    if (progressInterval) {
        clearInterval(progressInterval);
    }

    progressInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/progress/${currentDownloadId}`);
            const data = await response.json();

            if (data.success) {
                updateProgress(data);

                if (data.status === 'complete') {
                    clearInterval(progressInterval);
                    handleDownloadComplete(data);
                } else if (data.status === 'error') {
                    clearInterval(progressInterval);
                    handleDownloadError(data);
                }
            } else {
                clearInterval(progressInterval);
                showToast('Download tracking lost', 'error');
                resetDownloadButton();
            }
        } catch (error) {
            console.error('Progress polling error:', error);
        }
    }, 500); // Poll every 500ms
}

function updateProgress(data) {
    const progress = Math.min(data.progress || 0, 100);
    progressBar.style.width = `${progress}%`;
    progressPercent.textContent = `${Math.round(progress)}%`;

    if (data.status === 'downloading') {
        progressStatus.textContent = '⬇️ Downloading...';
        progressSpeed.textContent = `⚡ ${data.speed || '0 KB/s'}`;
        progressETA.textContent = `ETA: ${data.eta || 'calculating...'}`;
    } else if (data.status === 'converting') {
        progressStatus.textContent = '🔄 Converting...';
        progressSpeed.textContent = 'Processing';
        progressETA.textContent = 'Almost done...';
    }
}

function handleDownloadComplete(data) {
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressStatus.textContent = '✅ Complete!';
    progressSpeed.textContent = data.size || '';
    progressETA.textContent = 'Done!';

    showToast(`✅ Download complete! (${data.size})`, 'success');

    // Trigger file download
    const link = document.createElement('a');
    link.href = data.downloadUrl;
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset after 3 seconds
    setTimeout(() => {
        progressContainer.classList.add('hidden');
        resetDownloadButton();

        // Process next URL if in batch mode
        if (isProcessing && urlQueue.length > 0) {
            processNextUrl();
        }
    }, 3000);
}

function handleDownloadError(data) {
    showToast(data.error || 'Download failed', 'error');
    progressContainer.classList.add('hidden');
    resetDownloadButton();
}

function resetDownloadButton() {
    downloadBtn.innerHTML = '<span>⬇️ Download Now</span>';
    downloadBtn.disabled = false;
}

// Keyboard shortcuts
urlInput.addEventListener('keydown', (e) => {
    // Ctrl+Enter to analyze
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        analyzeBtn.click();
    }
});

// Platform cards click handler
document.querySelectorAll('.platform-card').forEach(card => {
    card.addEventListener('click', () => {
        const platformName = card.querySelector('span:last-child').textContent;
        showToast(`Paste a ${platformName} link to download!`, 'info');
        urlInput.focus();
    });
});

// Auto-focus input on page load
window.addEventListener('load', () => {
    urlInput.focus();
});

console.log('🚀 SaveMedia App Loaded - Enhanced with Batch Processing & Progress Tracking');
