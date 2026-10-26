/* Шаблон сайта салона: шапка, язык, «открыто сейчас», запись, просмотр фото. Без библиотек. */
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("site-data").textContent);
  var T = D.t;
  var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  var t0 = Date.now();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmt(s, vars) { return s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? vars[k] : ""; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function toMin(hhmm) { var p = hhmm.split(":"); return +p[0] * 60 + +p[1]; }
  function toHHMM(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }

  /* Текущее время во Вьетнаме, независимо от часового пояса телефона гостя */
  function nowVN() {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: D.tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short"
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
    return { y: +parts.year, mo: +parts.month, d: +parts.day, min: +parts.hour * 60 + +parts.minute, wd: wd };
  }
  function isoOf(y, mo, d) { return y + "-" + pad(mo) + "-" + pad(d); }
  function addDays(iso, n) {
    var dt = new Date(iso + "T12:00:00Z"); dt.setUTCDate(dt.getUTCDate() + n);
    return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  function weekdayOf(iso) { return (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; }
  function hoursOn(wd) { return D.hours[DAYS[wd]] || null; }

  /* ---------- шапка и нижняя панель ---------- */
  var nav = $(".nav"), hero = $(".hero"), bar = $(".actionbar");
  function onScroll() {
    var y = window.scrollY;
    var heroH = hero ? hero.offsetHeight : 0;
    if (nav) nav.classList.toggle("scrolled", !hero || y > 40);
    if (bar) bar.classList.toggle("show", !hero || y > heroH * 0.55);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- язык ---------- */
  var langMenu = $(".lang");
  $all("[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () { try { localStorage.setItem("lang", a.dataset.lang); } catch (e) {} });
  });
  document.addEventListener("click", function (e) { if (langMenu && !langMenu.contains(e.target)) langMenu.open = false; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && langMenu) langMenu.open = false; });
  // Первый заход на английскую главную: если телефон гостя на корейском, китайском, русском или вьетнамском, открываем его язык
  if (D.lang === "en") {
    var saved = null;
    try { saved = localStorage.getItem("lang"); } catch (e) {}
    if (!saved) {
      var prefs = (navigator.languages || [navigator.language || ""]).map(function (l) { return (l || "").slice(0, 2).toLowerCase(); });
      for (var i = 0; i < prefs.length; i++) {
        if (prefs[i] === "en") break;
        if (D.langs.indexOf(prefs[i]) > 0) {
          try { localStorage.setItem("lang", prefs[i]); } catch (e) {}
          location.replace(prefs[i] + "/" + location.hash);
          return;
        }
      }
    }
  }

  /* ---------- открыто сейчас ---------- */
  var now = nowVN();
  var todayIso = isoOf(now.y, now.mo, now.d);
  (function openStatus() {
    var el = $("#open-status");
    var today = hoursOn(now.wd);
    if (el) {
      if (today && today[0] === "00:00" && today[1] === "24:00") {
        el.textContent = T.open_24;
        el.className = "open-status is-open";
      } else if (today && now.min >= toMin(today[0]) && now.min < toMin(today[1])) {
        el.textContent = fmt(T.open_until, { t: today[1] });
        el.className = "open-status is-open";
      } else {
        for (var k = 0; k < 8; k++) {
          var wd = (now.wd + k) % 7, h = hoursOn(wd);
          if (!h || (k === 0 && now.min >= toMin(h[0]))) continue;
          var dayWord = k === 0 ? T.today : k === 1 ? T.tomorrow : D.days[wd];
          el.textContent = fmt(T.opens_at, { d: dayWord, t: h[0] });
          el.className = "open-status is-closed";
          break;
        }
      }
    }
    var row = $('.hours tr[data-day="' + DAYS[now.wd] + '"]') || $('.hours tr[data-day="all"]');
    if (row) row.classList.add("today");
  })();

  /* ---------- запись ---------- */
  var form = $("#book-form");
  if (form) {
    var dateEl = $("#f-date"), timeEl = $("#f-time"), serviceEl = $("#f-service");
    var F = form.elements, submitBtn = $("#f-submit"), errBox = $("#form-error"), done = $("#book-done");
    var lead = 30; // нельзя записаться ближе чем за 30 минут

    function slotsFor(iso) {
      var h = hoursOn(weekdayOf(iso));
      if (!h) return [];
      if (h[0] === "00:00" && h[1] === "24:00") h = ["08:00", "23:00"]; // круглосуточно: запись на разумные часы
      var start = toMin(h[0]), end = toMin(h[1]) - 30, out = [];
      var floor = iso === todayIso ? now.min + lead : -1;
      for (var m = start; m <= end; m += D.slot) if (m >= floor) out.push(toHHMM(m));
      return out;
    }
    function fillTimes() {
      var slots = slotsFor(dateEl.value), keep = timeEl.value;
      timeEl.innerHTML = "";
      var first = document.createElement("option");
      first.value = ""; first.textContent = slots.length ? T.f_time_pick : T.f_time_none;
      timeEl.appendChild(first);
      slots.forEach(function (s) {
        var o = document.createElement("option"); o.value = s; o.textContent = s;
        if (s === keep) o.selected = true;
        timeEl.appendChild(o);
      });
      timeEl.disabled = !slots.length;
    }
    // ближайший день, когда ещё можно записаться
    var firstDay = todayIso;
    for (var k = 0; k < 8 && !slotsFor(firstDay).length; k++) firstDay = addDays(firstDay, 1);
    dateEl.min = todayIso;
    dateEl.max = addDays(todayIso, 60);
    dateEl.value = firstDay;
    fillTimes();
    dateEl.addEventListener("change", fillTimes);

    function setInvalid(el, bad) { el.closest(".field").classList.toggle("invalid", bad); el.setAttribute("aria-invalid", bad ? "true" : "false"); }
    form.addEventListener("input", function (e) { if (e.target.closest(".field.invalid")) setInvalid(e.target, false); });

    function payload() {
      var opt = serviceEl.options[serviceEl.selectedIndex];
      var people = form.querySelector('input[name="people"]:checked');
      return {
        name: F.name.value.trim(), contact: F.contact.value.trim(),
        service: opt && opt.value ? opt.textContent.trim() : "", service_vi: opt ? opt.dataset.vi || "" : "",
        date: dateEl.value, time: timeEl.value, people: people ? +people.value : 1,
        note: F.note.value.trim(), lang: D.lang, website: F.website.value, elapsed: Date.now() - t0
      };
    }
    function waLink(p) {
      if (!D.wa) return null;
      var d = p.date.split("-"), wd = weekdayOf(p.date);
      var text = "Xin chào " + D.name + "! Tôi muốn đặt lịch:\n" +
        (p.service_vi ? "- Dịch vụ: " + p.service_vi + "\n" : "") +
        "- Thời gian: " + p.time + ", " + D.days_vi[wd] + " " + d[2] + "/" + d[1] + "\n" +
        (p.people > 1 ? "- Số khách: " + p.people + "\n" : "") +
        "- Tên: " + p.name + "\n\nHi! I'd like to book" + (p.service ? " " + p.service : "") + " at " + p.time + " on " + d[2] + "/" + d[1] + ".";
      return "https://wa.me/" + D.wa + "?text=" + encodeURIComponent(text);
    }
    function showDone(p) {
      var d = p.date.split("-");
      $("#done-summary").textContent = [p.service, D.days[weekdayOf(p.date)] + " " + d[2] + "/" + d[1], p.time].filter(Boolean).join(" · ");
      form.hidden = true; done.hidden = false; done.focus();
    }
    function showError(p) {
      var wa = waLink(p), btn = $("#err-wa");
      if (btn && wa) btn.href = wa;
      errBox.hidden = false;
      errBox.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errBox.hidden = true;
      var p = payload(), firstBad = null;
      [["name", p.name.length > 0], ["contact", /\d{6,}/.test(p.contact.replace(/\D/g, "")) || /@/.test(p.contact)],
       ["date", !!p.date], ["time", !!p.time]].forEach(function (pair) {
        var el = F[pair[0]]; setInvalid(el, !pair[1]);
        if (!pair[1] && !firstBad) firstBad = el;
      });
      if (firstBad) { firstBad.focus(); return; }

      submitBtn.disabled = true;
      var label = submitBtn.querySelector("span"), old = label.textContent;
      label.textContent = T.f_sending;
      function finish() { submitBtn.disabled = false; label.textContent = old; }

      if (D.demo) { setTimeout(function () { finish(); showDone(p); }, 700); return; }
      fetch(D.api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j.ok; }); })
        .catch(function () { return false; })
        .then(function (ok) { finish(); if (ok) showDone(p); else showError(p); });
    });

    // «Записаться» на карточке услуги подставляет эту услугу в форму
    $all("[data-service]").forEach(function (link) {
      link.addEventListener("click", function () { serviceEl.value = link.dataset.service; });
    });

    $("#book-again").addEventListener("click", function () {
      form.reset(); dateEl.value = firstDay; fillTimes(); done.hidden = true; form.hidden = false; t0 = Date.now();
    });
  }

  /* ---------- просмотр фото ---------- */
  var lb = $("#lightbox");
  if (lb && lb.showModal) {
    var items = $all(".g-item"), cur = 0, lbImg = $("#lb-img"), lbCount = $("#lb-count");
    function bigSrc(img) {
      var set = img.getAttribute("srcset");
      if (!set) return img.currentSrc || img.src;
      var last = set.split(",").pop().trim().split(" ")[0];
      return last;
    }
    function show(i) {
      cur = (i + items.length) % items.length;
      lbImg.src = bigSrc(items[cur].querySelector("img"));
      lbCount.textContent = fmt(T.photo_of, { n: cur + 1, total: items.length });
    }
    items.forEach(function (b, i) { b.addEventListener("click", function () { show(i); lb.showModal(); }); });
    lb.addEventListener("click", function (e) {
      var act = e.target.closest("[data-lb]");
      if (act) { var a = act.dataset.lb; if (a === "close") lb.close(); else show(cur + (a === "next" ? 1 : -1)); }
      else if (e.target === lb) lb.close();
    });
    lb.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") show(cur + 1);
      if (e.key === "ArrowLeft") show(cur - 1);
    });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1));
    });
  }
})();
