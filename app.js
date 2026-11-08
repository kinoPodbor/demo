const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_URL = "https://image.tmdb.org/t/p/w500";
"use strict";

const $ = id => document.getElementById(id);
const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w500";
const AUTH = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";

const GENRES = {
  28:"Боевик",12:"Приключения",16:"Мультфильм",35:"Комедия",
  80:"Криминал",99:"Документальный",18:"Драма",10751:"Семейный",
  14:"Фэнтези",36:"История",27:"Ужасы",10402:"Музыка",9648:"Детектив",
  10749:"Мелодрама",878:"Фантастика",10770:"ТВ-фильм",53:"Триллер",
  10752:"Военный",37:"Вестерн"
};

const state = {
  page: 1,
  totalPages: 1,
  movies: [],
  selectedFilter: "all",
  genre: "",
  year: "",
  sort: "popularity.desc",
  query: "",
  game: null,
  currentMovie: null
};

function read(key, fallback) {
  try {
    const value = localStorage.getItem("kp_" + key);
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem("kp_" + key, JSON.stringify(value)); }
  catch { showToast("Не удалось сохранить данные в браузере"); }
}
function getSet(key) { return new Set(read(key, [])); }
function imageUrl(path) { return path ? IMAGE + path : ""; }
function titleOf(movie) { return movie.title || movie.name || "Без названия"; }
function yearOf(movie) {
  const date = movie.release_date || movie.first_air_date || "";
  return date ? date.slice(0, 4) : "—";
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);
}

function getApiKey() {
  return localStorage.getItem("kp_tmdb_key") || "";
}
function saveApiKey(key) {
  if (key.trim()) localStorage.setItem("kp_tmdb_key", key.trim());
  else localStorage.removeItem("kp_tmdb_key");
}

async function api(path, params = {}) {
  const key = getApiKey();
  if (!key) throw new Error("NO_API_KEY");
  const url = new URL(API + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "ru-RU");
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "" && v !== null && v !== undefined) url.searchParams.set(k, v);
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error("Ошибка каталога: " + response.status);
  return response.json();
}

function setupFilters() {
  $("genreSelect").innerHTML = '<option value="">Все жанры</option>' +
    Object.entries(GENRES).map(([id, name]) =>
      `<option value="${id}">${name}</option>`).join("");

  const now = new Date().getFullYear();
  $("yearSelect").innerHTML = '<option value="">Любой год</option>' +
    Array.from({length: now - 1894}, (_, i) => now - i)
      .map(year => `<option value="${year}">${year}</option>`).join("");
}

function currentParams(page) {
  const params = {
    page,
    sort_by: state.sort,
    include_adult: "false",
    "vote_count.gte": state.sort === "vote_average.desc" ? 100 : undefined
  };
  if (state.genre) params.with_genres = state.genre;
  if (state.year) params.primary_release_year = state.year;
  return params;
}

async function loadMovies(reset = false) {
  if (reset) {
    state.page = 1;
    state.movies = [];
    $("movieGrid").innerHTML = '<div class="empty-state">Загружаем фильмы…</div>';
  }
  const key = getApiKey();
  if (!key) {
    $("movieGrid").innerHTML = `
      <div class="empty-state">
        <h3>Подключи каталог фильмов</h3>
        <p>Нужен API-ключ TMDB. Открой настройки и добавь его, чтобы загружать фильмы с постерами.</p>
        <button class="button primary" onclick="openSettings()">Открыть настройки</button>
        <p class="small">Для публичного сайта безопаснее подключить API через серверный Worker, а не хранить ключ в браузере.</p>
      </div>`;
    $("resultCount").textContent = "Нужна настройка";
    $("loadMore").hidden = true;
    return;
  }

  try {
    const path = state.query ? "/search/movie" : "/discover/movie";
    const params = state.query
      ? {page: state.page, query: state.query, include_adult: "false"}
      : currentParams(state.page);
    const data = await api(path, params);

    state.totalPages = Math.min(data.total_pages || 1, 500);
    const incoming = data.results || [];
    state.movies = reset ? incoming : state.movies.concat(incoming);
    renderMovies();
    $("resultCount").textContent = `${Number(data.total_results || 0).toLocaleString("ru-RU")} результатов`;
    $("loadMore").hidden = state.page >= state.totalPages || incoming.length === 0;
  } catch (error) {
    const message = error.message === "NO_API_KEY"
      ? "Добавь API-ключ TMDB в настройках."
      : "Не удалось загрузить каталог. Проверь ключ и соединение.";
    $("movieGrid").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    $("resultCount").textContent = "Каталог недоступен";
    $("loadMore").hidden = true;
  }
}

function visibleMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  let movies = [...state.movies];

  if (state.selectedFilter === "favorites")
    movies = movies.filter(m => favorites.has(m.id));
  if (state.selectedFilter === "watched")
    movies = movies.filter(m => watched.has(m.id));

  return movies;
}

function renderMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  const movies = visibleMovies();

  if (!movies.length) {
    $("movieGrid").innerHTML = '<div class="empty-state">Здесь пока пусто. Попробуй изменить фильтры.</div>';
    return;
  }

  $("movieGrid").innerHTML = movies.map(movie => {
    const title = escapeHtml(titleOf(movie));
    const poster = imageUrl(movie.poster_path);
    const rating = Number(movie.vote_average || 0).toFixed(1);
    return `
      <article class="movie-card">
        <div class="poster-wrap" data-open="${movie.id}" role="button" tabindex="0" aria-label="Подробнее: ${title}">
          ${poster
            ? `<img loading="lazy" src="${poster}" alt="Постер: ${title}" onerror="this.style.display='none';this.nextElementSibling.hidden=false">`
            : ""}
          <div class="poster-fallback" ${poster ? "hidden" : ""}>🎬<br>${title}</div>
          <span class="rating">★ ${rating}</span>
        </div>
        <div class="movie-card-body">
          <h3 class="movie-title" data-open="${movie.id}">${title}</h3>
          <div class="movie-year">${yearOf(movie)} · ${(movie.genre_ids || []).slice(0,2).map(id => GENRES[id] || "").filter(Boolean).join(", ")}</div>
          <div class="card-actions">
            <button class="${favorites.has(movie.id) ? "selected" : ""}" data-action="favorite" data-id="${movie.id}" aria-label="Избранное">${favorites.has(movie.id) ? "♥" : "♡"}</button>
            <button class="${watched.has(movie.id) ? "selected" : ""}" data-action="watched" data-id="${movie.id}" aria-label="Просмотрено">${watched.has(movie.id) ? "✓" : "＋"}</button>
            <button data-action="details" data-id="${movie.id}" aria-label="Подробнее">•••</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function toggleItem(key, id) {
  const items = getSet(key);
  if (items.has(id)) items.delete(id); else items.add(id);
  write(key, [...items]);
  renderMovies();
  renderProfile();
}

async function openMovie(id) {
  let movie = state.movies.find(m => m.id === Number(id));
  try {
    if (getApiKey()) movie = await api("/movie/" + id, {});
  } catch {}
  if (!movie) return showToast("Не удалось открыть фильм");
  state.currentMovie = movie;

  const title = titleOf(movie);
  const poster = imageUrl(movie.poster_path);
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  const reviews = read("reviews", {});
  const review = reviews[movie.id] || {};
  const genres = (movie.genres || (movie.genre_ids || []).map(id => ({name:GENRES[id]})))
    .map(g => g.name).filter(Boolean).join(", ");

  $("movieDetails").innerHTML = `
    <div class="detail-layout">
      ${poster ? `<img src="${poster}" alt="Постер ${escapeHtml(title)}">` : ""}
      <div>
        <div class="eyebrow">КАРТОЧКА ФИЛЬМА</div>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${yearOf(movie)} · ★ ${Number(movie.vote_average || 0).toFixed(1)}</p>
        <p>${escapeHtml(genres || "Жанр не указан")}</p>
        <p>${escapeHtml(movie.overview || "Описание пока отсутствует.")}</p>
        <div class="detail-actions">
          <button class="button secondary" id="detailFavorite">${favorites.has(movie.id) ? "♥ В избранном" : "♡ В избранное"}</button>
          <button class="button secondary" id="detailWatched">${watched.has(movie.id) ? "✓ Просмотрено" : "＋ Просмотрено"}</button>
        </div>
      </div>
    </div>
    <div class="review-form">
      <h3>Моя оценка и отзыв</h3>
      <label>Оценка от 1 до 10<select id="reviewRating">${Array.from({length:10},(_,i)=>`<option value="${i+1}" ${Number(review.rating)===i+1?"selected":""}>${i+1}/10</option>`).join("")}</select></label>
      <textarea id="reviewText" placeholder="Что ты думаешь об этом фильме?">${escapeHtml(review.text || "")}</textarea>
      <button class="button primary" id="saveReview">Сохранить отзыв</button>
      <p class="muted small">Личный отзыв сохраняется только в этом браузере.</p>
    </div>`;

  $("movieModal").hidden = false;
  $("detailFavorite").onclick = () => {
    toggleItem("favorites", movie.id);
    openMovie(movie.id);
  };
  $("detailWatched").onclick = () => {
    toggleItem("watched", movie.id);
    openMovie(movie.id);
  };
  $("saveReview").onclick = () => {
    const reviews = read("reviews", {});
    reviews[movie.id] = {
      title,
      rating: Number($("reviewRating").value),
      text: $("reviewText").value.trim()
    };
    write("reviews", reviews);
    renderProfile();
    showToast("Отзыв сохранён");
  };
}

function renderProfile() {
  const profile = read("profile", {name:"Киноман", emoji:"🎬"});
  $("sideName").textContent = profile.name;
  $("topName").textContent = profile.name;
  $("welcomeTitle").textContent = `С возвращением, ${profile.name}!`;
  $("sideAvatar").textContent = profile.emoji;
  $("topAvatar").textContent = profile.emoji;
  $("profileAvatar").textContent = profile.emoji;
  $("profileName").value = profile.name;
  $("profileEmoji").value = profile.emoji;
  $("statWatched").textContent = getSet("watched").size;
  $("statFavorites").textContent = getSet("favorites").size;
  $("statRecords").textContent = read("records", []).length;

  const reviews = Object.values(read("reviews", {}));
  $("myReviews").innerHTML = reviews.length
    ? reviews.map(r => `<div class="review-item"><strong>${escapeHtml(r.title)} · ★ ${r.rating}/10</strong><p>${escapeHtml(r.text || "Без комментария")}</p></div>`).join("")
    : '<div class="empty-state">Пока нет отзывов.</div>';
}

function renderRecords() {
  const records = read("records", []).sort((a,b) => b.score - a.score).slice(0,20);
  $("leaderboardList").innerHTML = records.length
    ? records.map((r,i) => `<div class="record-row"><span>${i+1}</span><strong>${escapeHtml(r.name)}</strong><span>★ ${r.score}</span></div>`).join("")
    : '<div class="empty-state">Сыграй первый раунд!</div>';
}

function openSettings() {
  $("themeSelect").value = document.body.dataset.theme || "dark";
  $("settingsModal").hidden = false;
}
window.openSettings = openSettings;

function setTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("kp_theme", theme);
}

function setupAuth() {
  $("loginButton").onclick = () => location.href = AUTH + "/login";
  fetch(AUTH + "/me", {credentials:"include"})
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      const user = data && (data.user || data);
      if (user && (user.login || user.display_name || user.real_name)) {
        $("authArea").innerHTML = `<span class="muted">${escapeHtml(user.display_name || user.real_name || user.login)}</span>`;
        $("sideStatus").textContent = "Вошли через Яндекс";
      }
    }).catch(() => {});
}

function startGame() {
  if (state.movies.length < 2) {
    showToast("Сначала подключи каталог и загрузи фильмы");
    return;
  }
  const pool = [...state.movies].filter(m => m.poster_path);
  if (pool.length < 2) return showToast("Недостаточно фильмов с постерами");
  const count = Math.min(Number($("roundCount").value), pool.length);
  for (let i=pool.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  state.game = {pool:pool.slice(0,count), index:0, hearts:5, score:0, usedHint:false, answered:false, started:Date.now()};
  $("gameSetup").hidden = true;
  $("gameResults").hidden = true;
  $("gamePlay").hidden = false;
  showRound();
}

function showRound() {
  const g = state.game;
  if (!g || g.index >= g.pool.length) return finishGame();
  const movie = g.pool[g.index];
  g.answered = false;
  g.usedHint = false;
  $("roundLabel").textContent = `Раунд ${g.index+1} / ${g.pool.length}`;
  $("gameScore").textContent = `Очки: ${g.score}`;
  $("heartBar").textContent = "♥ ".repeat(g.hearts) + "♡ ".repeat(5-g.hearts);
  $("gamePoster").src = imageUrl(movie.poster_path);
  $("gamePoster").alt = "Постер фильма";
  $("gamePrompt").textContent = "Угадай название фильма";
  $("guessInput").value = "";
  $("guessInput").disabled = false;
  $("submitGuess").disabled = false;
  $("gameFeedback").textContent = "";
  $("nextRound").hidden = true;
  document.querySelectorAll(".hint-button").forEach(b => b.disabled = false);
}

function answerGuess() {
  const g = state.game;
  if (!g || g.answered) return;
  const movie = g.pool[g.index];
  const answer = $("guessInput").value.trim().toLocaleLowerCase("ru");
  if (!answer) return;
  const correct = titleOf(movie).toLocaleLowerCase("ru");
  const original = (movie.original_title || "").toLocaleLowerCase("ru");
  if (answer === correct || answer === original) {
    g.score += 100 + g.hearts * 10;
    $("gameFeedback").textContent = "Верно! Отличное знание кино 🎉";
    $("gameFeedback").style.color = "var(--accent)";
  } else {
    $("gameFeedback").textContent = `Не совсем. Ответ: ${titleOf(movie)}`;
    $("gameFeedback").style.color = "#fca5a5";
  }
  g.answered = true;
  $("guessInput").disabled = true;
  $("submitGuess").disabled = true;
  $("nextRound").hidden = false;
  $("gameScore").textContent = `Очки: ${g.score}`;
  document.querySelectorAll(".hint-button").forEach(b => b.disabled = true);
}

function useHint(type) {
  const g = state.game;
  if (!g || g.answered) return;
  if (g.hearts <= 0) return showToast("Сердца закончились");
  const movie = g.pool[g.index];
  g.hearts--;
  let hint = "";
  if (type === "year") hint = "Год выхода: " + yearOf(movie);
  if (type === "genre") hint = "Жанр: " + (movie.genre_ids || []).map(id => GENRES[id]).filter(Boolean).join(", ");
  if (type === "letter") hint = "Первая буква: " + titleOf(movie).charAt(0);
  $("gamePrompt").textContent = hint;
  $("heartBar").textContent = "♥ ".repeat(g.hearts) + "♡ ".repeat(5-g.hearts);
  g.usedHint = true;
  const button = document.querySelector(`.hint-button[data-hint="${type}"]`);
  if (button) button.disabled = true;
}

function finishGame() {
  const g = state.game;
  if (!g) return;
  $("gamePlay").hidden = true;
  $("gameResults").hidden = false;
  const name = $("playerName").value.trim() || read("profile", {name:"Киноман"}).name || "Киноман";
  const records = read("records", []);
  records.push({name, score:g.score, date:new Date().toISOString()});
  write("records", records);
  $("gameResults").innerHTML = `<h3>Игра завершена! 🎬</h3><p>Игрок: ${escapeHtml(name)}</p><p>Твой результат: <strong>${g.score} очков</strong></p><button class="button primary" id="playAgain">Сыграть ещё раз</button>`;
  $("playAgain").onclick = () => {
    $("gameSetup").hidden = false;
    $("gameResults").hidden = true;
  };
  renderRecords();
  renderProfile();
}

function bindEvents() {
  $("searchInput").addEventListener("input", debounce(() => {
    state.query = $("searchInput").value.trim();
    loadMovies(true);
  }, 450));
  $("genreSelect").onchange = () => { state.genre=$("genreSelect").value; state.query=""; $("searchInput").value=""; loadMovies(true); };
  $("yearSelect").onchange = () => { state.year=$("yearSelect").value; loadMovies(true); };
  $("sortSelect").onchange = () => { state.sort=$("sortSelect").value; loadMovies(true); };
  $("loadMore").onclick = () => { state.page++; loadMovies(false); };

  $("quickFilters").onclick = event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.selectedFilter = button.dataset.filter;
    document.querySelectorAll(".filter-tab").forEach(b => b.classList.toggle("active", b===button));
    renderMovies();
  };

  $("movieGrid").addEventListener("click", event => {
    const action = event.target.closest("[data-action]");
    if (action) {
      const id = Number(action.dataset.id);
      if (action.dataset.action === "favorite") toggleItem("favorites", id);
      if (action.dataset.action === "watched") toggleItem("watched", id);
      if (action.dataset.action === "details") openMovie(id);
      return;
    }
    const open = event.target.closest("[data-open]");
    if (open) openMovie(Number(open.dataset.open));
  });
  $("movieGrid").addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-open]")) {
      event.preventDefault();
      openMovie(Number(event.target.dataset.open));
    }
  });

  $("surpriseButton").onclick = surprise;
  $("themeToggle").onclick = () => {
    const themes = ["dark","light","violet","ocean"];
    const current = document.body.dataset.theme || "dark";
    setTheme(themes[(themes.indexOf(current)+1)%themes.length]);
  };
  $("profileShortcut").onclick = () => location.hash = "profile";
  $("openSettings").onclick = openSettings;
  $("closeSettings").onclick = () => $("settingsModal").hidden = true;
  $("themeSelect").onchange = () => setTheme($("themeSelect").value);
  $("languageSelect").onchange = () => showToast("Перевод интерфейса будет добавлен отдельно");

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => $(button.dataset.close).hidden = true;
  });
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) backdrop.hidden = true;
    });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") document.querySelectorAll(".modal-backdrop").forEach(m => m.hidden = true);
  });

  $("saveProfile").onclick = () => {
    write("profile", {name:$("profileName").value.trim() || "Киноман", emoji:$("profileEmoji").value});
    renderProfile();
    showToast("Профиль сохранён");
  };
  $("startGame").onclick = startGame;
  $("submitGuess").onclick = answerGuess;
  $("guessInput").addEventListener("keydown", event => { if (event.key==="Enter") answerGuess(); });
  $("nextRound").onclick = () => { state.game.index++; showRound(); };
  document.querySelectorAll(".hint-button").forEach(button => {
    button.onclick = () => useHint(button.dataset.hint);
  });
}

function surprise() {
  const movies = state.movies.filter(m => m.poster_path);
  if (!movies.length) {
    location.hash = "catalog";
    showToast("Сначала подключи каталог фильмов");
    return;
  }
  openMovie(movies[Math.floor(Math.random()*movies.length)].id);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer=setTimeout(() => fn(...args),delay); };
}

function init() {
  setupFilters();
  bindEvents();
  setTheme(localStorage.getItem("kp_theme") || "dark");
  renderProfile();
  renderRecords();
  setupAuth();
  loadMovies(true);
}

init();
