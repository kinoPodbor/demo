
"use strict";

/* =========================
   KinoPodbor — app.js
   Совместим с index.html
   ========================= */

const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w500";
const BACKDROP = "https://image.tmdb.org/t/p/w1280";
const AUTH = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";

const $ = id => document.getElementById(id);

const GENRES = {
  28: "Боевик", 12: "Приключения", 16: "Мультфильм",
  35: "Комедия", 80: "Криминал", 99: "Документальный",
  18: "Драма", 10751: "Семейный", 14: "Фэнтези",
  36: "История", 27: "Ужасы", 10402: "Музыка",
  9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика",
  10770: "ТВ-фильм", 53: "Триллер", 10752: "Военный",
  37: "Вестерн"
};

const state = {
  page: 1,
  totalPages: 1,
  totalResults: 0,
  movies: [],
  selectedFilter: "popular",
  genre: "",
  year: "",
  sort: "popular",
  query: "",
  requestId: 0,
  game: null,
  user: null,
  playlists: read("playlists", [])
};

function read(key, fallback) {
  try {
    const value = localStorage.getItem("kp_" + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem("kp_" + key, JSON.stringify(value));
    return true;
  } catch {
    showToast("Не удалось сохранить данные браузера");
    return false;
  }
}

function getSet(key) {
  return new Set(read(key, []));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function titleOf(movie) {
  return movie.title || movie.name || "Без названия";
}

function yearOf(movie) {
  const date = movie.release_date || movie.first_air_date || "";
  return date.slice(0, 4) || "—";
}

function imageUrl(path, size = IMAGE) {
  return path ? size + path : "";
}

let toastTimer;

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* =========================
   TMDB
   ========================= */

async function api(path, params = {}) {
  if (!TMDB_API_KEY ||
      TMDB_API_KEY === "ВСТАВЬ_СВОЙ_TMDB_API_KEY") {
    throw new Error("NO_API_KEY");
  }

  const url = new URL(API + path);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("language", "ru-RU");

  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 401) throw new Error("INVALID_API_KEY");
    if (response.status === 429) throw new Error("RATE_LIMIT");
    throw new Error("API_ERROR_" + response.status);
  }

  return response.json();
}

function setupFilters() {
  $("genreSelect").innerHTML =
    '<option value="">Все жанры</option>' +
    Object.entries(GENRES).map(([id, name]) =>
      `<option value="${id}">${escapeHtml(name)}</option>`
    ).join("");

  const year = new Date().getFullYear();
  $("yearSelect").innerHTML =
    '<option value="">Любой год</option>' +
    Array.from({ length: year - 1887 }, (_, i) => year - i)
      .map(y => `<option value="${y}">${y}</option>`)
      .join("");
}

function getCatalogParams(page) {
  const params = {
    page,
    include_adult: "false"
  };

  if (state.genre) params.with_genres = state.genre;
  if (state.year) params.primary_release_year = state.year;

  if (state.sort === "rating") {
    params.sort_by = "vote_average.desc";
    params["vote_count.gte"] = 100;
  } else if (state.sort === "newest") {
    params.sort_by = "primary_release_date.desc";
  } else {
    params.sort_by = "popularity.desc";
  }

  return params;
}

async function loadMovies(reset = false) {
  if (reset) {
    state.requestId++;
    state.page = 1;
    state.movies = [];
  }

  const requestId = state.requestId;
  $("loadMore").disabled = true;

  if (reset) {
    $("movieGrid").innerHTML =
      '<div class="empty-state">Загружаем фильмы…</div>';
  }

  if (!TMDB_API_KEY ||
      TMDB_API_KEY === "ВСТАВЬ_СВОЙ_TMDB_API_KEY") {
    $("movieGrid").innerHTML = `
      <div class="empty-state">
        <h3>Нужен API-ключ TMDB</h3>
        <p>Укажи свой API Key v3 в начале файла app.js.</p>
      </div>`;
    $("resultCount").textContent = "Нет ключа API";
    $("loadMore").hidden = true;
    return;
  }

  try {
    let path;
    let params;

    if (state.query) {
      path = "/search/movie";
      params = {
        page: state.page,
        query: state.query,
        include_adult: "false"
      };
    } else {
      const filters = {
        popular: "/movie/popular",
        top: "/movie/top_rated",
        now: "/movie/now_playing",
        upcoming: "/movie/upcoming"
      };

      path = state.genre || state.year || state.sort !== "popular"
        ? "/discover/movie"
        : filters[state.selectedFilter] || "/movie/popular";

      params = path === "/discover/movie"
        ? getCatalogParams(state.page)
        : { page: state.page };
    }

    const data = await api(path, params);

    if (requestId !== state.requestId) return;

    state.totalPages = Math.min(data.total_pages || 1, 500);
    state.totalResults = data.total_results || 0;

    state.movies = reset
      ? (data.results || [])
      : state.movies.concat(data.results || []);

    renderMovies();

    $("resultCount").textContent =
      `${state.totalResults.toLocaleString("ru-RU")} результатов`;

    $("loadMore").hidden =
      state.page >= state.totalPages ||
      !(data.results || []).length;

  } catch (error) {
    if (requestId !== state.requestId) return;

    const messages = {
      NO_API_KEY: "Добавь API-ключ TMDB в начале app.js.",
      INVALID_API_KEY: "TMDB отклонил ключ. Проверь его.",
      RATE_LIMIT: "Слишком много запросов. Попробуй позже."
    };

    $("movieGrid").innerHTML =
      `<div class="empty-state">${escapeHtml(
        messages[error.message] || "Не удалось загрузить фильмы. Проверь соединение."
      )}</div>`;

    $("resultCount").textContent = "Ошибка загрузки";
    $("loadMore").hidden = true;
  } finally {
    if (requestId === state.requestId) {
      $("loadMore").disabled = false;
    }
  }
}

/* =========================
   Каталог и коллекции
   ========================= */

function visibleMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");

  if (state.selectedFilter === "favorites") {
    return state.movies.filter(m => favorites.has(m.id));
  }

  if (state.selectedFilter === "watched") {
    return state.movies.filter(m => watched.has(m.id));
  }

  return state.movies;
}

function renderMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  const movies = visibleMovies();

  if (!movies.length) {
    $("movieGrid").innerHTML =
      '<div class="empty-state">Здесь пока нет фильмов.</div>';
    return;
  }

  $("movieGrid").innerHTML = movies.map(movie => {
    const id = Number(movie.id);
    const title = escapeHtml(titleOf(movie));
    const poster = imageUrl(movie.poster_path);
    const rating = Number(movie.vote_average || 0).toFixed(1);
    const genres = (movie.genre_ids || [])
      .map(id => GENRES[id]).filter(Boolean).slice(0, 2).join(", ");

    return `
      <article class="movie-card">
        <div class="poster-wrap" data-open="${id}" role="button"
          tabindex="0" aria-label="Подробнее: ${title}">
          ${poster
            ? `<img loading="lazy" src="${poster}" alt="Постер: ${title}"
                onerror="this.hidden=true">`
            : `<div class="poster-fallback">🎬 ${title}</div>`}
          <span class="rating">★ ${rating}</span>
        </div>
        <div class="movie-card-body">
          <h3 class="movie-title" data-open="${id}">${title}</h3>
          <div class="movie-year">${yearOf(movie)} · ${escapeHtml(genres)}</div>
          <div class="card-actions">
            <button class="${favorites.has(id) ? "selected" : ""}"
              data-action="favorite" data-id="${id}" aria-label="Избранное">
              ${favorites.has(id) ? "♥" : "♡"}
            </button>
            <button class="${watched.has(id) ? "selected" : ""}"
              data-action="watched" data-id="${id}" aria-label="Просмотрено">
              ${watched.has(id) ? "✓" : "＋"}
            </button>
            <button data-action="details" data-id="${id}" aria-label="Подробнее">•••</button>
          </div>
          <button class="button secondary add-to-playlist"
            data-action="add-playlist" data-id="${id}"
            style="width:100%;margin-top:7px">＋ В плейлист</button>
        </div>
      </article>`;
  }).join("");
}

function toggleItem(key, id) {
  const items = getSet(key);
  items.has(id) ? items.delete(id) : items.add(id);
  write(key, [...items]);
  renderMovies();
  renderProfile();
}

/* =========================
   Карточка фильма и отзывы
   ========================= */

async function openMovie(id) {
  let movie = state.movies.find(m => Number(m.id) === Number(id));

  try {
    movie = await api("/movie/" + id);
  } catch {
    if (!movie) {
      showToast("Не удалось загрузить карточку фильма");
      return;
    }
  }

  const reviews = read("reviews", {});
  const review = reviews[movie.id] || {};
  const favorites = getSet("favorites");
  const watched = getSet("watched");

  const genres = movie.genres
    ? movie.genres.map(g => g.name).join(", ")
    : (movie.genre_ids || []).map(g => GENRES[g]).filter(Boolean).join(", ");

  $("modalContent").innerHTML = `
    <div class="detail-layout">
      ${movie.poster_path
        ? `<img src="${imageUrl(movie.poster_path)}" alt="Постер">`
        : ""}
      <div>
        <div class="eyebrow">КАРТОЧКА ФИЛЬМА</div>
        <h2 id="modalTitle">${escapeHtml(titleOf(movie))}</h2>
        <p class="muted">${yearOf(movie)} · ★ ${Number(movie.vote_average || 0).toFixed(1)}</p>
        <p>${escapeHtml(genres || "Жанр не указан")}</p>
        <p>${escapeHtml(movie.overview || "Описание отсутствует.")}</p>
        <div class="detail-actions">
          <button class="button secondary" id="detailFavorite">
            ${favorites.has(movie.id) ? "♥ В избранном" : "♡ В избранное"}
          </button>
          <button class="button secondary" id="detailWatched">
            ${watched.has(movie.id) ? "✓ Просмотрено" : "＋ Просмотрено"}
          </button>
          <button class="button secondary" id="detailAddPlaylist">＋ В плейлист</button>
        </div>
      </div>
    </div>
    <div class="review-form">
      <h3>Моя оценка и отзыв</h3>
      <label>Оценка
        <select id="reviewRating">
          ${Array.from({length:10},(_,i)=>i+1).map(n =>
            `<option value="${n}" ${Number(review.rating)===n?"selected":""}>${n}/10</option>`
          ).join("")}
        </select>
      </label>
      <textarea id="reviewText" maxlength="2000"
        placeholder="Что ты думаешь об этом фильме?">${escapeHtml(review.text || "")}</textarea>
      <button class="button primary" id="saveReview">Сохранить отзыв</button>
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

  $("detailAddPlaylist").onclick = () => addMovieToPlaylist(movie);

  $("saveReview").onclick = () => {
    const all = read("reviews", {});
    all[movie.id] = {
      title: titleOf(movie),
      rating: Number($("reviewRating").value),
      text: $("reviewText").value.trim(),
      date: new Date().toISOString()
    };
    write("reviews", all);
    renderProfile();
    showToast("Отзыв сохранён");
  };
}

/* =========================
   Профиль
   ========================= */

function renderProfile() {
  const profile = read("profile", { name: "Киноман", emoji: "🍿" });
  const name = state.user?.name || state.user?.display_name ||
    state.user?.real_name || profile.name || "Киноман";
  const emoji = profile.emoji || "🍿";

  $("miniProfileName").textContent = name;
  $("miniAvatar").textContent = emoji;
  $("topAvatar").textContent = emoji;
  $("profileAvatar").textContent = emoji;

  if (state.user?.avatar) {
    const avatarUrl = String(state.user.avatar);
    $("profileAvatar").innerHTML =
      `<img src="${escapeHtml(avatarUrl)}" alt="Аватар Яндекса"
      style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    $("miniAvatar").innerHTML =
      `<img src="${escapeHtml(avatarUrl)}" alt=""
      style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
    $("topAvatar").innerHTML =
      `<img src="${escapeHtml(avatarUrl)}" alt=""
      style="width:28px;height:28px;object-fit:cover;border-radius:8px">`;
  }

  $("profileName").value = name;
  $("profileEmoji").value = emoji;

  $("favoriteCount").textContent = getSet("favorites").size;
  $("watchedCount").textContent = getSet("watched").size;
  $("reviewCount").textContent = Object.keys(read("reviews", {})).length;

  const reviews = Object.values(read("reviews", {}));
  $("myReviews").innerHTML = reviews.length
    ? reviews.map(review => `
        <div class="review-item">
          <strong>${escapeHtml(review.title)} · ★ ${Number(review.rating)}/10</strong>
          <p>${escapeHtml(review.text || "Без комментария")}</p>
        </div>`).join("")
    : '<p class="muted">Ты пока не оставил отзывов.</p>';

  $("logoutBtn").hidden = !state.user;
  $("authStatus").textContent = state.user ? "Вошли через Яндекс" : "Локальный профиль";
}

function saveProfile() {
  const name = $("profileName").value.trim().slice(0, 30) || "Киноман";
  const emoji = $("profileEmoji").value.trim().slice(0, 8) || "🍿";

  write("profile", { name, emoji });
  renderProfile();
  showToast("Профиль сохранён");
}

/* =========================
   Плейлисты
   ========================= */

function renderPlaylists() {
  state.playlists = read("playlists", []);
  const list = $("playlistList");

  if (!state.playlists.length) {
    list.innerHTML = '<p class="muted">Создай свою первую подборку.</p>';
    return;
  }

  list.innerHTML = state.playlists.map(playlist => `
    <div class="review-item">
      <strong>${escapeHtml(playlist.name)}</strong>
      <p class="muted small">
        ${playlist.movies.length} фильмов · ${playlist.public ? "Публичный" : "Приватный"}
      </p>
      <div class="detail-actions">
        <button class="button secondary" data-playlist-action="toggle"
          data-id="${escapeHtml(playlist.id)}">
          ${playlist.public ? "Сделать приватным" : "Сделать публичным"}
        </button>
        <button class="button secondary" data-playlist-action="rename"
          data-id="${escapeHtml(playlist.id)}">Переименовать</button>
        <button class="button secondary" data-playlist-action="play"
          data-id="${escapeHtml(playlist.id)}">Играть по кадрам</button>
        <button class="button secondary" data-playlist-action="delete"
          data-id="${escapeHtml(playlist.id)}">Удалить</button>
      </div>
      <p class="small muted">${playlist.movies.map(m => escapeHtml(m.title)).join(" · ") || "Пока пусто"}</p>
    </div>`).join("");
}

function savePlaylists() {
  write("playlists", state.playlists);
  renderPlaylists();
}

function createPlaylist(event) {
  event.preventDefault();
  const name = $("playlistName").value.trim();
  if (!name) return;

  state.playlists = read("playlists", []);
  state.playlists.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    public: $("playlistPublic").checked,
    movies: [],
    createdAt: new Date().toISOString()
  });

  savePlaylists();
  $("playlistForm").reset();
  showToast("Плейлист создан");
}

function addMovieToPlaylist(movie) {
  state.playlists = read("playlists", []);

  if (!state.playlists.length) {
    showToast("Сначала создай плейлист в профиле");
    $("movieModal").hidden = true;
    location.hash = "profile";
    return;
  }

  const choice = prompt(
    "Введи номер плейлиста:\n" +
    state.playlists.map((p, i) => `${i + 1}. ${p.name}`).join("\n")
  );

  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || !state.playlists[index]) return;

  const playlist = state.playlists[index];

  if (playlist.movies.some(m => Number(m.id) === Number(movie.id))) {
    showToast("Фильм уже есть в подборке");
    return;
  }

  playlist.movies.push({
    id: movie.id,
    title: titleOf(movie),
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
    release_date: movie.release_date || "",
    genre_ids: movie.genre_ids || (movie.genres || []).map(g => g.id),
    original_title: movie.original_title || titleOf(movie)
  });

  savePlaylists();
  showToast("Фильм добавлен в плейлист");
}

function handlePlaylistClick(event) {
  const button = event.target.closest("[data-playlist-action]");
  if (!button) return;

  const playlist = state.playlists.find(p => p.id === button.dataset.id);
  if (!playlist) return;

  switch (button.dataset.playlistAction) {
    case "delete":
      if (confirm(`Удалить плейлист «${playlist.name}»?`)) {
        state.playlists = state.playlists.filter(p => p.id !== playlist.id);
        savePlaylists();
        showToast("Плейлист удалён");
      }
      break;

    case "rename": {
      const name = prompt("Новое название:", playlist.name);
      if (name && name.trim()) {
        playlist.name = name.trim().slice(0, 60);
        savePlaylists();
      }
      break;
    }

    case "toggle":
      playlist.public = !playlist.public;
      savePlaylists();
      showToast("Настройки плейлиста изменены");
      break;

    case "play":
      if (!playlist.movies.length) {
        showToast("Добавь в плейлист несколько фильмов");
        return;
      }
      startGame(playlist.movies);
      location.hash = "game";
      break;
  }
}

/* =========================
   Рекорды
   ========================= */

function renderRecords() {
  const records = read("records", [])
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  $("leaderboardList").innerHTML = records.length
    ? records.map((record, i) => `
      <div class="record-row">
        <span>${i + 1}</span>
        <strong>${escapeHtml(record.name)}</strong>
        <span>★ ${Number(record.score) || 0}</span>
      </div>`).join("")
    : '<div class="empty-state">Сыграй первую партию!</div>';
}

/* =========================
   Настройки
   ========================= */

function setTheme(theme) {
  const allowed = ["dark", "light", "violet", "ocean"];
  const selected = allowed.includes(theme) ? theme : "dark";
  document.body.dataset.theme = selected;
  write("theme", selected);
}

function openSettings() {
  $("themeSelect").value = document.body.dataset.theme || "dark";
  $("settingsModal").hidden = false;
}

/* =========================
   Яндекс OAuth
   ========================= */

async function setupAuth() {
  try {
    const response = await fetch(AUTH + "/me", {
      credentials: "include"
    });

    if (!response.ok) return;

    const data = await response.json();
    const user = data.user || data;

    if (user && (user.id || user.login || user.display_name)) {
      state.user = {
        id: user.id,
        name: user.display_name || user.real_name || user.name || user.login || "Пользователь",
        avatar: user.avatar || user.default_avatar_id
          ? (String(user.avatar || "").startsWith("http")
              ? user.avatar
              : "")
          : ""
      };

      $("authArea").innerHTML = `
        <span class="muted">${escapeHtml(state.user.name)}</span>
        <button class="button secondary" id="headerLogout" type="button">Выйти</button>`;

      $("headerLogout").onclick = logout;
      renderProfile();
    }
  } catch {
    // Сайт остаётся доступен без авторизации.
  }
}

async function logout() {
  try {
    await fetch(AUTH + "/logout", { credentials: "include" });
  } catch {}

  state.user = null;
  $("authArea").innerHTML =
    `<a class="button secondary" href="${AUTH}/login">Войти через Яндекс</a>`;
  renderProfile();
  showToast("Вы вышли из аккаунта");
}

/* =========================
   Игра по кадрам
   ========================= */

function startGame(customPool = null) {
  const pool = (customPool || state.movies).filter(movie =>
    movie.backdrop_path || movie.poster_path
  );

  if (!pool.length) {
    showToast("Нет фильмов с изображениями. Загрузите каталог.");
    return;
  }

  const shuffled = [...pool];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const count = Math.min(Number($("roundCount").value) || 5, shuffled.length);

  state.game = {
    pool: shuffled.slice(0, count),
    index: 0,
    score: 0,
    hearts: 5,
    answered: false,
    hints: new Set()
  };

  $("gameSetup").hidden = true;
  $("gameResults").hidden = true;
  $("gamePlay").hidden = false;

  showRound();
}

function showRound() {
  const game = state.game;
  if (!game || game.index >= game.pool.length) {
    finishGame();
    return;
  }

  const movie = game.pool[game.index];
  const path = movie.backdrop_path || movie.poster_path;
  const isBackdrop = Boolean(movie.backdrop_path);
  const img = $("gamePoster");

  img.src = imageUrl(path, isBackdrop ? BACKDROP : IMAGE);
  img.alt = "Кадр из фильма";
  img.style.aspectRatio = isBackdrop ? "16 / 9" : "2 / 3";
  img.style.objectFit = "cover";
  img.hidden = false;
  $("gameImageFallback").hidden = true;

  img.onerror = () => {
    img.hidden = true;
    $("gameImageFallback").hidden = false;
    $("gameImageFallback").textContent = "Изображение недоступно";
  };

  $("gameProgress").textContent =
    `Раунд ${game.index + 1} / ${game.pool.length}`;
  $("gameScore").textContent = `Очки: ${game.score}`;
  $("gamePrompt").textContent = "Угадай название фильма";
  $("guessInput").value = "";
  $("guessInput").disabled = false;
  $("submitGuess").disabled = false;
  $("gameFeedback").textContent = "";
  $("nextRound").hidden = true;

  document.querySelectorAll("[data-hint]").forEach(button => {
    button.disabled = false;
  });

  game.answered = false;
  game.hints = new Set();
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function answerGuess(event) {
  if (event) event.preventDefault();

  const game = state.game;
  if (!game || game.answered) return;

  const answer = normalizeAnswer($("guessInput").value);
  if (!answer) {
    showToast("Введи название фильма");
    return;
  }

  const movie = game.pool[game.index];
  const accepted = [
    titleOf(movie),
    movie.original_title || ""
  ].map(normalizeAnswer).filter(Boolean);

  if (accepted.includes(answer)) {
    game.score += Math.max(20, 100 - game.hints.size * 20);
    $("gameFeedback").textContent = "Верно! Отличное знание кино 🎉";
    $("gameFeedback").style.color = "var(--accent)";
  } else {
    $("gameFeedback").textContent = `Правильный ответ: ${titleOf(movie)}`;
    $("gameFeedback").style.color = "#fca5a5";
  }

  game.answered = true;
  $("guessInput").disabled = true;
  $("submitGuess").disabled = true;
  $("nextRound").hidden = false;
  $("gameScore").textContent = `Очки: ${game.score}`;

  document.querySelectorAll("[data-hint]").forEach(button => {
    button.disabled = true;
  });
}

function useHint(type) {
  const game = state.game;
  if (!game || game.answered || game.hints.has(type)) return;

  const movie = game.pool[game.index];
  game.hints.add(type);

  if (type === "year") {
    $("gamePrompt").textContent = "Год выхода: " + yearOf(movie);
  } else if (type === "genre") {
    const genres = (movie.genre_ids || [])
      .map(id => GENRES[id]).filter(Boolean);
    $("gamePrompt").textContent = "Жанр: " + (genres.join(", ") || "неизвестен");
  } else if (type === "letter") {
    $("gamePrompt").textContent =
      "Первая буква: " + titleOf(movie).charAt(0);
  }

  const button = document.querySelector(`[data-hint="${type}"]`);
  if (button) button.disabled = true;
}

function finishGame() {
  const game = state.game;
  if (!game) return;

  $("gamePlay").hidden = true;
  $("gameResults").hidden = false;

  const profile = read("profile", { name: "Киноман" });
  const name = $("playerName").value.trim() || profile.name || "Киноман";
  const records = read("records", []);

  records.push({
    name,
    score: game.score,
    date: new Date().toISOString()
  });

  write("records", records);

  $("gameResults").innerHTML = `
    <h3>Игра завершена! 🎬</h3>
    <p>Игрок: ${escapeHtml(name)}</p>
    <p>Результат: <strong>${game.score} очков</strong></p>
    <button class="button primary" id="playAgain" type="button">Сыграть ещё раз</button>`;

  $("playAgain").onclick = () => {
    $("gameSetup").hidden = false;
    $("gameResults").hidden = true;
  };

  renderRecords();
  renderProfile();
}

/* =========================
   Случайный фильм
   ========================= */

async function surprise() {
  let pool = state.movies.filter(m => m.poster_path);

  if (!pool.length) {
    try {
      const data = await api("/movie/popular", { page: 1 });
      pool = data.results || [];
    } catch {
      showToast("Не удалось загрузить случайный фильм");
      return;
    }
  }

  if (pool.length) {
    const movie = pool[Math.floor(Math.random() * pool.length)];
    openMovie(movie.id);
  }
}

/* =========================
   Навигация
   ========================= */

const PAGES = {
  home: "Главная",
  catalog: "Каталог фильмов",
  game: "Угадай фильм",
  records: "Рекорды",
  profile: "Профиль"
};

function showPage(id, updateHistory = true) {
  if (!PAGES[id]) id = "home";

  Object.keys(PAGES).forEach(page => {
    const section = $(page);
    if (section) section.classList.toggle("page-active", page === id);
  });

  document.querySelectorAll(".side-nav a, .mobile-nav a").forEach(link => {
    const active = link.getAttribute("href") === "#" + id;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  $("pageTitle").textContent = PAGES[id];

  if (updateHistory && location.hash !== "#" + id) {
    history.pushState(null, "", "#" + id);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

/* =========================
   События
   ========================= */

function bindEvents() {
  $("searchInput").addEventListener("input", debounce(() => {
    state.query = $("searchInput").value.trim();
    loadMovies(true);
  }, 400));

  $("genreSelect").onchange = () => {
    state.genre = $("genreSelect").value;
    loadMovies(true);
  };

  $("yearSelect").onchange = () => {
    state.year = $("yearSelect").value;
    loadMovies(true);
  };

  $("sortSelect").onchange = () => {
    state.sort = $("sortSelect").value;
    loadMovies(true);
  };

  $("quickFilters").addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;

    state.selectedFilter = button.dataset.filter;
    document.querySelectorAll("#quickFilters [data-filter]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    state.query = "";
    $("searchInput").value = "";
    loadMovies(true);
  });

  $("loadMore").onclick = () => {
    if (state.page >= state.totalPages) return;
    state.page++;
    loadMovies(false);
  };

  $("movieGrid").addEventListener("click", event => {
    const button = event.target.closest("[data-action]");

    if (button) {
      const id = Number(button.dataset.id);
      const movie = state.movies.find(m => Number(m.id) === id);

      if (button.dataset.action === "favorite") toggleItem("favorites", id);
      if (button.dataset.action === "watched") toggleItem("watched", id);
      if (button.dataset.action === "details") openMovie(id);
      if (button.dataset.action === "add-playlist" && movie) addMovieToPlaylist(movie);
      return;
    }

    const open = event.target.closest("[data-open]");
    if (open) openMovie(Number(open.dataset.open));
  });

  $("movieGrid").addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") &&
        event.target.matches("[data-open]")) {
      event.preventDefault();
      openMovie(Number(event.target.dataset.open));
    }
  });

  $("surpriseBtn").onclick = surprise;
  $("openSettings").onclick = openSettings;

  $("themeSelect").onchange = () => setTheme($("themeSelect").value);
  $("saveSettings").onclick = () => {
    setTheme($("themeSelect").value);
    $("settingsModal").hidden = true;
    showToast("Настройки сохранены");
  };

  $("saveProfile").onclick = saveProfile;
  $("logoutBtn").onclick = logout;

  $("playlistForm").addEventListener("submit", createPlaylist);
  $("playlistList").addEventListener("click", handlePlaylistClick);

  $("startGame").onclick = () => startGame();
  $("guessForm").addEventListener("submit", answerGuess);
  $("nextRound").onclick = () => {
    if (!state.game) return;
    state.game.index++;
    showRound();
  };

  document.querySelectorAll("[data-hint]").forEach(button => {
    button.onclick = () => useHint(button.dataset.hint);
  });

  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.onclick = () => {
      const modal = button.closest(".modal-backdrop");
      if (modal) modal.hidden = true;
    };
  });

  document.querySelectorAll(".modal-backdrop").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.hidden = true;
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-backdrop").forEach(modal => {
        modal.hidden = true;
      });
    }
  });

  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute("href").slice(1);
    if (!PAGES[id]) return;

    event.preventDefault();
    showPage(id);
  });

  window.addEventListener("popstate", () => {
    showPage(location.hash.slice(1) || "home", false);
  });

  window.addEventListener("hashchange", () => {
    showPage(location.hash.slice(1) || "home", false);
  });
}

function debounce(callback, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

/* =========================
   Запуск
   ========================= */

async function init() {
  setupFilters();
  bindEvents();

  setTheme(read("theme", "dark"));
  renderProfile();
  renderRecords();
  renderPlaylists();
  showPage(location.hash.slice(1) || "home", false);

  await setupAuth();
  await loadMovies(true);
}

init();
