(function () {
  'use strict';

  const API = '/api/am';
  const TIMEOUT_MS = 25000; // client timeout > server, biar server yang menang kalau gagal

  const $email = document.getElementById('email');
  const $link = document.getElementById('link');
  const $btnSend = document.getElementById('btnSend');
  const $btnVerify = document.getElementById('btnVerify');
  const $result = document.getElementById('result');

  function showResult(type, message) {
    $result.className = 'result ' + type;
    $result.textContent = message;
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
        signal: controller.signal
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

  $btnSend.addEventListener('click', async () => {
    const email = $email.value.trim();
    if (!email) return showResult('err', '❌ Email wajib diisi!');

    setLoading($btnSend, true, 'KIRIM MAGIC LINK');
    showResult('loading', '⏳ Mengirim magic link...');

    try {
      const data = await callAPI({ action: 'send', email });
      if (data.ok) {
        showResult('ok', '✅ ' + (data.message || 'Magic link terkirim! Cek email kamu.'));
      } else {
        showResult('err', '❌ ' + (data.message || 'Gagal mengirim.'));
      }
    } catch (e) {
      showResult('err', '❌ ' + (e.name === 'AbortError' ? 'Server timeout, coba lagi.' : e.message));
    } finally {
      setLoading($btnSend, false, 'KIRIM MAGIC LINK');
    }
  });

  $btnVerify.addEventListener('click', async () => {
    const email = $email.value.trim();
    const link = $link.value.trim();
    if (!email || !link) return showResult('err', '❌ Email & Link wajib diisi!');

    setLoading($btnVerify, true, 'VERIFIKASI SEKARANG');
    showResult('loading', '⏳ Memverifikasi...');

    try {
      const data = await callAPI({ action: 'verify', email, link });
      if (data.ok) {
        showResult('ok', '🎉 ' + (data.message || 'Verifikasi berhasil!'));
      } else {
        showResult('err', '❌ ' + (data.message || 'Verifikasi gagal.'));
      }
    } catch (e) {
      showResult('err', '❌ ' + (e.name === 'AbortError' ? 'Server timeout, coba lagi.' : e.message));
    } finally {
      setLoading($btnVerify, false, 'VERIFIKASI SEKARANG');
    }
  });
})();