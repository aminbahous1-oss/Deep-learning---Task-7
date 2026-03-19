/**
 * journal.js – Journal entry, speech recognition, Watson NLU analysis, localStorage
 */

(function () {
  const STORAGE_KEY = 'mindjournal_entries';

  /* ── DOM refs ── */
  const textarea        = document.getElementById('journalEntry');
  const micBtn          = document.getElementById('micBtn');
  const analyzeBtn      = document.getElementById('analyzeBtn');
  const statusDiv       = document.getElementById('status');
  const emotionBarsDiv  = document.getElementById('emotionBars');
  const sentimentDiv    = document.getElementById('sentimentResult');
  const mockNotice      = document.getElementById('mockNotice');
  const analysisCard    = document.getElementById('analysisCard');
  const entryDateSpan   = document.getElementById('entryDate');

  /* ── Emotion colours (must match CSS) ── */
  const EMOTION_COLORS = {
    joy:     '#FCD34D',
    sadness: '#60A5FA',
    anger:   '#F87171',
    fear:    '#A78BFA',
    disgust: '#6EE7B7'
  };

  /* ── Date display ── */
  if (entryDateSpan) {
    const now = new Date();
    entryDateSpan.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  /* =========================================================
     Speech Recognition
     ========================================================= */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isRecording = false;

  if (!SpeechRecognition) {
    // Disable mic button if API not available
    if (micBtn) {
      micBtn.disabled = true;
      micBtn.title = 'Speech recognition is not supported in this browser.';
      micBtn.style.opacity = '0.5';
      micBtn.style.cursor = 'not-allowed';
    }
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';

    recognition.onstart = () => {
      isRecording = true;
      micBtn.textContent = '⏹ Stop Recording';
      micBtn.classList.add('recording');
      setStatus('Recording… speak now.');
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      // Append final text to textarea; show interim in status
      if (finalTranscript) {
        textarea.value += finalTranscript;
        finalTranscript = '';
      }
      if (interim) setStatus(`Hearing: "${interim}"`);
    };

    recognition.onerror = (event) => {
      console.warn('[journal.js] Speech error:', event.error);
      stopRecording();
      if (event.error === 'not-allowed') {
        setStatus('Microphone access denied.');
      } else {
        setStatus('Speech recognition error: ' + event.error);
      }
    };

    recognition.onend = () => {
      if (isRecording) {
        // Restart if user hasn't manually stopped
        recognition.start();
      }
    };

    micBtn.addEventListener('click', () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  function startRecording() {
    if (!recognition) return;
    try {
      recognition.start();
    } catch (e) {
      console.warn('[journal.js] Recognition already started:', e);
    }
  }

  function stopRecording() {
    if (!recognition) return;
    isRecording = false;
    recognition.stop();
    micBtn.textContent = '🎤 Start Recording';
    micBtn.classList.remove('recording');
    setStatus('');
  }

  /* =========================================================
     Status helper
     ========================================================= */
  function setStatus(msg, duration) {
    if (!statusDiv) return;
    statusDiv.textContent = msg;
    if (duration) {
      setTimeout(() => { statusDiv.textContent = ''; }, duration);
    }
  }

  /* =========================================================
     Render Emotion Bars
     ========================================================= */
  function renderEmotionBars(emotions) {
    if (!emotionBarsDiv) return;
    emotionBarsDiv.innerHTML = '';

    const order = ['joy', 'sadness', 'anger', 'fear', 'disgust'];
    for (const key of order) {
      const value = emotions[key] ?? 0;
      const pct   = Math.round(value * 100);
      const color = EMOTION_COLORS[key] || '#7C3AED';

      const row = document.createElement('div');
      row.className = 'emotion-bar-row';
      row.innerHTML = `
        <span class="emotion-bar-label">${key}</span>
        <div class="emotion-bar-track">
          <div class="emotion-bar-fill ${key}" style="width: 0%; background: ${color};"></div>
        </div>
        <span class="emotion-bar-pct">${pct}%</span>
      `;
      emotionBarsDiv.appendChild(row);

      // Animate fill after short delay
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          row.querySelector('.emotion-bar-fill').style.width = pct + '%';
        });
      });
    }
  }

  /* =========================================================
     Render Sentiment
     ========================================================= */
  function renderSentiment(sentiment) {
    if (!sentimentDiv) return;
    const label = sentiment.label || 'neutral';
    const score = typeof sentiment.score === 'number'
      ? (sentiment.score >= 0 ? '+' : '') + sentiment.score.toFixed(2)
      : '';

    sentimentDiv.innerHTML = `
      <span class="sentiment-badge ${label}">${label}</span>
      ${score ? `<span class="sentiment-score">Score: ${score}</span>` : ''}
    `;
  }

  /* =========================================================
     Dominant emotion helper
     ========================================================= */
  function dominantEmotion(emotions) {
    let best = null, bestVal = -1;
    for (const [k, v] of Object.entries(emotions)) {
      if (v > bestVal) { bestVal = v; best = k; }
    }
    return best;
  }

  /* =========================================================
     LocalStorage helpers
     ========================================================= */
  function loadEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveEntry(entry) {
    const entries = loadEntries();
    entries.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  /* =========================================================
     Analyze button handler
     ========================================================= */
  analyzeBtn && analyzeBtn.addEventListener('click', async () => {
    const text = textarea ? textarea.value.trim() : '';
    if (!text) {
      setStatus('Please write something before analyzing.', 3000);
      return;
    }

    analyzeBtn.disabled = true;
    setStatus('Analyzing…');

    // 1. Capture face emotion (non-blocking — skip if models not ready within 3s)
    let faceEmotion = null;
    try {
      if (typeof window.captureFaceEmotion === 'function') {
        const timeout = new Promise(resolve => setTimeout(resolve, 3000, null));
        const faceResult = await Promise.race([window.captureFaceEmotion(), timeout]);
        faceEmotion = faceResult ? faceResult.emotion : null;
      }
    } catch (e) {
      console.warn('[journal.js] Face capture failed:', e);
    }

    // 2. POST to /analyze
    let analysisResult = null;
    try {
      const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      analysisResult = await response.json();
    } catch (err) {
      console.error('[journal.js] /analyze error:', err);
      setStatus('Analysis failed. Please try again.', 4000);
      analyzeBtn.disabled = false;
      return;
    }

    // 3. Render results
    renderEmotionBars(analysisResult.emotion || {});
    renderSentiment(analysisResult.sentiment || {});

    if (analysisCard) analysisCard.style.display = 'block';

    if (mockNotice) {
      mockNotice.style.display = analysisResult.mock ? 'block' : 'none';
    }

    // 4. Save to localStorage
    const entry = {
      id:          Date.now(),
      date:        new Date().toISOString(),
      text,
      emotion:     analysisResult.emotion || {},
      sentiment:   analysisResult.sentiment || {},
      faceEmotion: faceEmotion || null
    };
    saveEntry(entry);

    // 5. Done
    setStatus('✓ Entry saved!', 4000);
    analyzeBtn.disabled = false;
  });

})();
