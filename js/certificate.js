/* certificate.js
 * Draws a completion certificate onto a canvas and returns a PNG data URL.
 * No external dependencies so it works fully offline / on GitHub Pages.
 */
(function (global) {
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = Array.from(text);
    let line = '';
    const lines = [];
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines.length;
  }

  function drawCertificate({ canvas, name, score, total, dateStr, title, message }) {
    const W = 1600, H = 1131;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // background
    ctx.fillStyle = '#FBFAF5';
    ctx.fillRect(0, 0, W, H);

    // outer border
    ctx.strokeStyle = '#4C8C4A';
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.strokeStyle = '#D9E2D3';
    ctx.lineWidth = 2;
    ctx.strokeRect(64, 64, W - 128, H - 128);

    // corner leaf marks (simple circles motif)
    const drawLeaf = (x, y, flip) => {
      ctx.save();
      ctx.translate(x, y);
      if (flip) ctx.scale(-1, 1);
      ctx.fillStyle = '#E4F0E1';
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 40, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawLeaf(140, 130, false);
    drawLeaf(W - 140, 130, true);
    drawLeaf(140, H - 130, false);
    drawLeaf(W - 140, H - 130, true);

    // badge
    ctx.fillStyle = '#4C8C4A';
    ctx.beginPath();
    ctx.arc(W / 2, 210, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 46px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♻', W / 2, 216);

    // title
    ctx.fillStyle = '#22301F';
    ctx.font = '900 58px "Zen Maru Gothic", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title || 'ごみ分別マスター認定証', W / 2, 340);

    // decorative rule
    ctx.strokeStyle = '#E08A3C';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, 370);
    ctx.lineTo(W / 2 + 90, 370);
    ctx.stroke();

    // recipient
    ctx.font = '500 26px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#55614F';
    ctx.fillText('This certifies that', W / 2, 430);

    ctx.font = '700 64px "Zen Maru Gothic", sans-serif';
    ctx.fillStyle = '#22301F';
    ctx.fillText((name && name.trim()) || 'ゲスト', W / 2, 510);

    // underline for name
    const nameWidth = ctx.measureText((name && name.trim()) || 'ゲスト').width;
    ctx.strokeStyle = '#D9E2D3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - nameWidth / 2 - 30, 535);
    ctx.lineTo(W / 2 + nameWidth / 2 + 30, 535);
    ctx.stroke();

    // message
    ctx.font = '400 26px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#55614F';
    ctx.textAlign = 'center';
    wrapText(ctx, message || 'あなたはごみ分別クイズに合格しました。', W / 2, 600, 900, 38);

    // score
    ctx.font = '700 40px "Zen Maru Gothic", sans-serif';
    ctx.fillStyle = '#4C8C4A';
    ctx.fillText(`正答 ${score} / ${total} 問`, W / 2, 700);

    // date
    ctx.font = '400 22px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#55614F';
    ctx.fillText(dateStr, W / 2, H - 130);

    // footer label
    ctx.font = '500 18px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#9AA593';
    ctx.fillText('ごみ分別クイズ', W / 2, H - 90);

    return canvas.toDataURL('image/png');
  }

  function downloadCertificate(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename || 'gomi-quiz-certificate.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  global.GomiCertificate = { drawCertificate, downloadCertificate };
})(window);
