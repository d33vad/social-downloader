const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

async function install() {
    console.log('⬇️ Downloading yt-dlp binary...');

    // Determine fileName based on platform (though yt-dlp-wrap usually handles this, we want a fixed path)
    const fileName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

    // Create 'bin' directory
    const binDir = path.join(__dirname, 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir);
    }

    const binaryPath = path.join(binDir, fileName);

    try {
        // Download latest release
        await YTDlpWrap.downloadFromGithub(binaryPath);
        console.log(`✅ Downloaded yt-dlp to: ${binaryPath}`);

        // Ensure executable on Unix-like systems
        if (process.platform !== 'win32') {
            fs.chmodSync(binaryPath, '755');
            console.log('✅ Set executable permissions');
        }
    } catch (error) {
        console.error('❌ Failed to download yt-dlp binary:', error);
        process.exit(1);
    }
}

install();
