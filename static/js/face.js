/**
 * face.js – Webcam startup and face emotion detection via face-api.js
 *
 * Exposes:
 *   captureFaceEmotion() -> Promise<{ emotion: string, score: number } | null>
 */

(function () {
  const MODELS_URL = '/static/models';

  const video  = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const faceResult = document.getElementById('faceResult');

  let modelsLoaded = false;
  let stream = null;

  // Emotion → emoji map for display
  const EMOTION_EMOJI = {
    happy:     '😄',
    sad:       '😢',
    angry:     '😠',
    fearful:   '😨',
    disgusted: '🤢',
    surprised: '😲',
    neutral:   '😐'
  };

  // face-api uses slightly different names than our palette; map to canonical names
  const EMOTION_NAME_MAP = {
    happy:     'joy',
    sad:       'sadness',
    angry:     'anger',
    fearful:   'fear',
    disgusted: 'disgust',
    surprised: 'surprised',
    neutral:   'neutral'
  };

  /* ── Load models ── */
  async function loadModels() {
    if (modelsLoaded) return;
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODELS_URL)
      ]);
      modelsLoaded = true;
      console.log('[face.js] Models loaded.');
    } catch (err) {
      console.error('[face.js] Failed to load models:', err);
    }
  }

  /* ── Start webcam ── */
  async function startWebcam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setFaceResult('<p class="placeholder-text">Webcam not supported in this browser.</p>');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        // Size the hidden canvas to match the video
        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
      };
    } catch (err) {
      console.warn('[face.js] Webcam access denied or unavailable:', err);
      setFaceResult('<p class="placeholder-text">Camera access denied. Allow camera permissions to use this feature.</p>');
    }
  }

  /* ── Helpers ── */
  function setFaceResult(html) {
    if (faceResult) faceResult.innerHTML = html;
  }

  function dominantExpression(expressions) {
    let best = null;
    let bestScore = -1;
    for (const [emotion, score] of Object.entries(expressions)) {
      if (score > bestScore) {
        bestScore = score;
        best = emotion;
      }
    }
    return best ? { emotion: best, score: bestScore } : null;
  }

  /* ── Public: captureFaceEmotion ── */
  window.captureFaceEmotion = async function () {
    if (!modelsLoaded) {
      setFaceResult('<p class="placeholder-text">Loading face detection models…</p>');
      await loadModels();
    }

    if (!video.srcObject || video.readyState < 2) {
      setFaceResult('<p class="placeholder-text">Webcam not ready yet.</p>');
      return null;
    }

    // Draw current video frame to hidden canvas
    const ctx = canvas.getContext('2d');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const detection = await faceapi
        .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
        .withFaceExpressions();

      if (!detection) {
        setFaceResult('<p class="placeholder-text">No face detected. Make sure your face is visible.</p>');
        return null;
      }

      const result = dominantExpression(detection.expressions);
      if (!result) return null;

      const { emotion: dominantRaw, score: dominantScore } = result;
      const canonicalName = EMOTION_NAME_MAP[dominantRaw] || dominantRaw;
      const emoji = EMOTION_EMOJI[dominantRaw] || '🙂';

      // Build a breakdown of all emotion scores using known keys
      const EXPRESSION_KEYS = ['happy', 'neutral', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
      const expr = detection.expressions;
      const allEmotions = EXPRESSION_KEYS
        .map(k => ({ key: k, score: expr[k] || 0 }))
        .sort((a, b) => b.score - a.score);

      let barsHtml = '';
      for (const item of allEmotions) {
        const pct = Math.round(item.score * 100);
        const label = EMOTION_NAME_MAP[item.key] || item.key;
        const bold = item.key === dominantRaw ? ' face-bar-dominant' : '';
        barsHtml += '<div class="face-bar-row">'
          + '<span class="face-bar-label' + bold + '">' + label + '</span>'
          + '<div class="face-bar-track"><div class="face-bar-fill" style="width:' + pct + '%;"></div></div>'
          + '<span class="face-bar-pct">' + pct + '%</span>'
          + '</div>';
      }

      setFaceResult(
        '<div class="face-emotion-row">'
        + '<span class="face-emotion-icon">' + emoji + '</span>'
        + '<div>'
        + '<div class="face-emotion-name">' + canonicalName + '</div>'
        + '<div class="face-emotion-score">Confidence: ' + Math.round(dominantScore * 100) + '%</div>'
        + '</div></div>'
        + '<div class="face-bars">' + barsHtml + '</div>'
      );

      return { emotion: canonicalName, score: dominantScore };
    } catch (err) {
      console.error('[face.js] Detection error:', err.message || err);
      setFaceResult('<p class="placeholder-text">Face detection failed. Try again.</p>');
      return null;
    }
  };

  /* ── Wire up the capture button ── */
  function wireCapureBtn() {
    const captureBtn = document.getElementById('captureBtn');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => {
        window.captureFaceEmotion();
      });
    }
  }

  /* ── Initialise on DOM ready ── */
  async function init() {
    await startWebcam();
    await loadModels();
    wireCapureBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
