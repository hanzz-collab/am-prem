(function () {
  'use strict';

  const API = '/api/am';
  const TIMEOUT_MS = 25000;

  // ==== Step Management ====
  const panels = {
    1: document.getElementById('step1'),
    2: document.getElementById('step2'),
    3: document.getElementById('step3'),
  };
  const stepEls = document.querySelectorAll('.step');
  const stepLines = document.querySelectorAll('.step-line');
  const stepsWrap = document.getElementById('steps');

  function goToStep(n) {
    Object.entries(panels).forEach(([k, el]) => el.classList.remove('active'));
    panels[n].classList.add('active');

    stepEls.forEach((el) => {
      const s = Number(el.dataset.step);
      el.classList.remove('active', 'done');
      if (s === n) el.classList.add('active');
      else if (s < n) el.classList.add('done');
    });

    stepLines.forEach((line, i) => {
      line.classList.toggle('done', i + 1 < n);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==== Elements ====
  const $email = document.getElementById('email');
  const $link = document.getElementById('link');
  const $emailPreview = document.getElementById('emailPreview');
  const $finalEmail = document.getElementById('finalEmail');

  const $btnSend = document.getElementById('btnSend');
  const $btnVerify = document.getElementById('btnVerify');
  const $btnBack = document.getElementById('btnBack');
  const $btnRestart = document.getElementById('btnRestart');

  const $result1 = document.getElementById('result1');
  const $result2 = document.getElementById('result2');

  // ==== Helpers ====
  function showResult(el, type, message) {
    el.className = 'result ' + type;
    el.textContent = message;
  }

  function hideResult(el) {
    el.className = 'result hidden';
    el.textContent = '';
  }

  function setLoading(btn, isLoading, originalText) {
    btn.disabled = isLoading;
    const span = btn.querySelector('span');
    if (span) span.textContent = isLoading ? '⏳ LOADING...' : originalText;
  }

  async function callAPI(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server balas bukan JSON (status ${res.status})`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  // ==== Auto-switch ke Step 2 setelah magic link terkirim ====
  let pendingEmail = '';

  $btnSend.addEventListener('click', async () => {
    const email = $email.value.trim();
    if (!email) return showResult($result1, 'err', '❌ Email wajib diisi!');

    setLoading($btnSend, true, 'KIRIM MAGIC LINK');
    showResult($result1, 'loading', '⏳ Mengirim magic link...');

    try {
      const data = await callAPI({ action: 'send', email });
      if (data.ok) {
        pendingEmail = email;
        $emailPreview.textContent = email;
        showResult(
          $result1,
          'ok',
          '✅ ' + (data.message || 'Magic link terkirim! Cek email kamu.')
        );

        // Jeda bentar biar user sempat lihat notif sukses, lalu pindah step
        setTimeout(() => {
          hideResult($result1);
          goToStep(2);
          $link.focus();
        }, 1400);
      } else {
        showResult($result1, 'err', '❌ ' + (data.message || 'Gagal mengirim.'));
      }
    } catch (e) {
      showResult(
        $result1,
        'err',
        '❌ ' + (e.name === 'AbortError' ? 'Server timeout, coba lagi.' : e.message)
      );
    } finally {
      setLoading($btnSend, false, 'KIRIM MAGIC LINK');
    }
  });

  // ==== Verifikasi ====
  $btnVerify.addEventListener('click', async () => {
    const email = pendingEmail || $email.value.trim();
    const link = $link.value.trim();
    if (!email || !link) return showResult($result2, 'err', '❌ Link verifikasi wajib diisi!');

    setLoading($btnVerify, true, 'VERIFIKASI SEKARANG');
    showResult($result2, 'loading', '⏳ Memverifikasi...');

    try {
      const data = await callAPI({ action: 'verify', email, link });
      if (data.ok) {
        showResult($result2, 'ok', '🎉 ' + (data.message || 'Premium berhasil diaktifkan!'));

        // Tampilkan email di halaman sukses
        $finalEmail.textContent = email;

        // Pindah ke Step 3 setelah jeda singkat
        setTimeout(() => {
          hideResult($result2);
          goToStep(3);
        }, 1400);
      } else {
        showResult($result2, 'err', '❌ ' + (data.message || 'Verifikasi gagal.'));
      }
    } catch (e) {
      showResult(
        $result2,
        'err',
        '❌ ' + (e.name === 'AbortError' ? 'Server timeout, coba lagi.' : e.message)
      );
    } finally {
      setLoading($btnVerify, false, 'VERIFIKASI SEKARANG');
    }
  });

  // ==== Tombol "Ganti Email" (balik ke Step 1) ====
  $btnBack.addEventListener('click', () => {
    hideResult($result2);
    $link.value = '';
    goToStep(1);
    $email.focus();
  });

  // ==== Tombol "Mulai Lagi" (reset total) ====
  $btnRestart.addEventListener('click', () => {
    pendingEmail = '';
    $email.value = '';
    $link.value = '';
    $emailPreview.textContent = 'kamu';
    $finalEmail.textContent = '-';
    hideResult($result1);
    hideResult($result2);
    goToStep(1);
    $email.focus();
  });

  // ==== Init ====
  goToStep(1);
})();
