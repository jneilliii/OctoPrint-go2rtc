/**
 * This is example, how you can extend VideoRTC player for your app.
 * Also you can check this example: https://github.com/AlexxIT/WebRTC
 */
class VideoStream extends VideoRTC {
    set divMode(value) {
        this.querySelector('.mode').innerText = value;
        this.querySelector('.status').innerText = '';
    }

    set divError(value) {
        const state = this.querySelector('.mode').innerText;
        if (state !== 'loading') return;
        this.querySelector('.mode').innerText = 'error';
        this.querySelector('.status').innerText = value;
    }

    /**
     * Custom GUI
     */
    oninit() {
        super.oninit();

        this.innerHTML = `
        <style>
        video-stream {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: auto;
        }
        video-stream.rotated video {
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
            object-fit: contain;
        }
        .go2rtc.info {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            padding: 12px;
            color: white;
            display: flex;
            justify-content: space-between;
            pointer-events: none;
        }
        </style>
        <div class="go2rtc info">
            <div class="status"></div>
            <div class="mode"></div>
        </div>
        `;

        const info = this.querySelector('.go2rtc.info');
        this.insertBefore(this.video, info);
        this.applyTransformsStatic();
    }

    /**
     * Apply rotation and mirroring transforms statically before video starts
     */
    applyTransformsStatic() {
        if (!this.video) return;

        const flipH = this.getAttribute('data-flip-h') === 'true';
        const flipV = this.getAttribute('data-flip-v') === 'true';
        const rotate90 = this.getAttribute('data-rotate90') === 'true';

        // Add/remove rotated class for container styling
        if (rotate90) {
            this.classList.add('rotated');
        } else {
            this.classList.remove('rotated');
        }

        // Set transform origin
        this.video.style.transformOrigin = 'center center';

        // Build transform list
        let transforms = [];
        if (flipH) transforms.push('scaleX(-1)');
        if (flipV) transforms.push('scaleY(-1)');
        if (rotate90) transforms.push('rotate(-90deg)');

        // Apply transforms
        this.video.style.transform = transforms.length > 0 ? transforms.join(' ') : '';
    }

    onconnect() {
        console.debug('stream.onconnect');
        const result = super.onconnect();
        if (result) this.divMode = 'loading';
        return result;
    }

    ondisconnect() {
        console.debug('stream.ondisconnect');
        super.ondisconnect();
    }

    onopen() {
        console.debug('stream.onopen');
        const result = super.onopen();

        this.onmessage['stream'] = msg => {
            console.debug('stream.onmessge', msg);
            switch (msg.type) {
                case 'error':
                    this.divError = msg.value;
                    break;
                case 'mse':
                case 'hls':
                case 'mp4':
                case 'mjpeg':
                    this.divMode = msg.type.toUpperCase();
                    break;
            }
        };

        return result;
    }

    onclose() {
        console.debug('stream.onclose');
        return super.onclose();
    }

    onpcvideo(ev) {
        console.debug('stream.onpcvideo');
        super.onpcvideo(ev);

        if (this.pcState !== WebSocket.CLOSED) {
            this.divMode = 'RTC';
        }
    }
}

customElements.define('video-stream', VideoStream);
