/** Run this in the browser console to validate layout. Results appear as a console table. */
(function () {
  var results = [];
  var fails = 0;
  var passes = 0;

  var root = getComputedStyle(document.documentElement);

  function px(val) {
    if (!val || val === 'auto' || val === 'none') return null;
    return parseFloat(String(val));
  }

  /* ---------- .page-box ---------- */
  document.querySelectorAll('.page-box').forEach(function (el) {
    var cs = getComputedStyle(el);
    var actual = el.offsetWidth;
    var minW = px(root.getPropertyValue('--sw20').trim());
    var maxW = px(root.getPropertyValue('--sw60').trim());
    var label = el.className.slice(0, 40) || 'page-box';
    if (minW !== null && actual < minW) {
      results.push({ element: label, expected: 'width >= ' + minW + 'px', actual: actual + 'px', result: 'FAIL' });
      fails++;
    } else if (maxW !== null && actual > maxW + 1) {
      results.push({ element: label, expected: 'width <= ' + maxW + 'px', actual: actual + 'px', result: 'FAIL' });
      fails++;
    } else {
      results.push({ element: label, expected: minW + 'px \u2013 ' + maxW + 'px', actual: actual + 'px', result: 'PASS' });
      passes++;
    }
  });

  /* ---------- .page-col / .page-col-full ---------- */
  document.querySelectorAll('.page-col, .page-col-full').forEach(function (el) {
    var cs = getComputedStyle(el);
    var actual = el.offsetWidth;
    var minW = px(root.getPropertyValue('--sw20').trim());
    var label = el.className.slice(0, 40);
    if (minW !== null && actual < minW - 1) {
      results.push({ element: label, expected: 'width >= ' + minW + 'px', actual: actual + 'px', result: 'FAIL' });
      fails++;
    } else {
      results.push({ element: label, expected: 'width >= ' + minW + 'px', actual: actual + 'px', result: 'PASS' });
      passes++;
    }
  });

  /* ---------- .top-nav ---------- */
  document.querySelectorAll('.top-nav').forEach(function (el) {
    var actual = el.offsetWidth;
    var minW = px(root.getPropertyValue('--sw20').trim());
    var maxW = px(root.getPropertyValue('--sw60').trim());
    if (minW !== null && actual < minW - 1) {
      results.push({ element: '.top-nav', expected: 'width >= ' + minW + 'px', actual: actual + 'px', result: 'FAIL' });
      fails++;
    } else if (maxW !== null && actual > maxW + 1) {
      results.push({ element: '.top-nav', expected: 'width <= ' + maxW + 'px', actual: actual + 'px', result: 'FAIL' });
      fails++;
    } else {
      results.push({ element: '.top-nav', expected: minW + 'px \u2013 ' + maxW + 'px', actual: actual + 'px', result: 'PASS' });
      passes++;
    }
  });

  /* ---------- .btn-row button equal width ---------- */
  document.querySelectorAll('.btn-row').forEach(function (row) {
    var btns = row.querySelectorAll(':scope > button');
    if (btns.length < 2) return;
    var widths = [];
    btns.forEach(function (b) { widths.push(b.offsetWidth); });
    var first = widths[0];
    var allEqual = widths.every(function (w) { return w === first; });
    if (allEqual) {
      results.push({ element: '.btn-row (buttons)', expected: 'all ' + first + 'px', actual: widths.join(', ') + 'px', result: 'PASS' });
      passes++;
    } else {
      results.push({ element: '.btn-row (buttons)', expected: 'equal width', actual: widths.join(', ') + 'px', result: 'FAIL' });
      fails++;
    }
  });

  /* ---------- .panel backdrop-filter ---------- */
  document.querySelectorAll('.panel').forEach(function (el) {
    var bf = getComputedStyle(el).getPropertyValue('backdrop-filter');
    var hasBlur = bf && bf !== 'none' && bf.indexOf('blur') !== -1;
    var label = el.className.slice(0, 40);
    if (hasBlur) {
      results.push({ element: label, expected: 'backdrop-filter: blur()', actual: bf, result: 'PASS' });
      passes++;
    } else {
      results.push({ element: label, expected: 'backdrop-filter: blur()', actual: bf || 'none', result: 'FAIL' });
      fails++;
    }
  });

  /* ---------- stretch: block div that is parent of a button, button not filling parent ---------- */
  document.querySelectorAll('div').forEach(function (div) {
    var cs = getComputedStyle(div);
    if (cs.display === 'flex' || cs.display === 'grid') return;
    var btn = div.querySelector(':scope > button');
    if (!btn) return;
    var innerSibling = div.querySelector(':scope > :not(button)');
    if (innerSibling) return; /* mixed siblings — layout is probably intentional */
    var parentWidth = div.clientWidth;
    var btnWidth = btn.offsetWidth;
    var tolerance = 2;
    if (btnWidth < parentWidth - tolerance) {
      results.push({ element: 'stretch:' + (div.className || 'div') + ' > button', expected: 'fill parent (' + parentWidth + 'px)', actual: btnWidth + 'px', result: 'WARN' });
      fails++;
    }
  });

  /* ---------- output ---------- */
  console.table(results);
  console.log(
    '%cLayout Validation%c ' + passes + ' passed, ' + fails + ' failed/warned',
    'font-weight:bold;font-size:14px;',
    'font-size:12px;color:' + (fails ? '#E60012' : '#16c79a') + ';'
  );
})();
