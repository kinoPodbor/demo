"use strict";

/*
 * KinoPodbor — приложение
 * TMDB API v3
 *
 * Вставь свой API Key v3 вместо строки ниже.
 * ВНИМАНИЕ: ключ в клиентском коде виден посетителям сайта.
 */

const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w500";
const AUTH = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";

const $ = id => document.getElementById(id);

const GENRES = {
  28: "Боевик",
  12: "Приключения",
  16: "Мультфильм",
  35: "Комедия",
  80: "Криминал",
  99: "Документальный",
  18: "Драма",
  10751: "Семейный",
  14: "Фэнтези",
  36: "История",
  27: "Ужасы",
  10402: "Музыка",
  9648: "Детектив",
  10749: "Мелодрама",
  878: "Фантастика",
  10770: "ТВ-фильм",
  53: "Триллер",
  10752: "Военный",
  37: "Вестерн"
};

const state = {
  page: 1,
  totalPages: 1,
  totalResults: 0,
  movies: [],
  selectedFilter: "all",
  genre: "",
  year: "",
  sort: "popularity.desc",
  query: "",
  game: null,
  currentMovie: null,
  loading: false,
  requestId: 0
};

/* ---------------------------
   Локальное хранилище
--------------------------- */

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
  } catch {
    showToast("Не удалось сохранить данные браузера");
  }
}

function getSet(key) {
  return new Set(read(key, []));
}

function imageUrl(path) {
  return path ? IMAGE + path : "";
}

function titleOf(movie) {
  return movie.title || movie.name || "Без названия";
}

function yearOf(movie) {
  const date = movie.release_date || movie.first_air_date || "";
  return date ? date.slice(0, 4) : "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

let toastTimer;

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

/* ---------------------------
   TMDB API
--------------------------- */

function getApiKey() {
  return TMDB_API_KEY.trim();
}

async function api(path, params = {}) {
  const key = getApiKey();

  if (!key || key === "ВСТАВЬ_СВОЙ_TMDB_API_KEY") {
    throw new Error("NO_API_KEY");
  }

  const url = new URL(API + path);

  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "ru-RU");

  for (const [name, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("INVALID_API_KEY");
    }

    if (response.status === 429) {
      throw new Error("RATE_LIMIT");
    }

    throw new Error("API_ERROR_" + response.status);
  }

  return response.json();
}

/* ---------------------------
   Фильтры каталога
--------------------------- */

function setupFilters() {
  $("genreSelect").innerHTML =
    '<option value="">Все жанры</option>' +
    Object.entries(GENRES).map(([id, name]) =>
      `<option value="${id}">${escapeHtml(name)}</option>`
    ).join("");

  const currentYear = new Date().getFullYear();

  $("yearSelect").innerHTML =
    '<option value="">Любой год</option>' +
    Array.from(
      { length: currentYear - 1887 },
      (_, index) => currentYear - index
    ).map(year =>
      `<option value="${year}">${year}</option>`
    ).join("");
}

function currentParams(page) {
  const params = {
    page,
    sort_by: state.sort,
    include_adult: "false"
  };

  if (state.genre) {
    params.with_genres = state.genre;
  }

  if (state.year) {
    params.primary_release_year = state.year;
  }

  if (state.sort === "vote_average.desc") {
    params["vote_count.gte"] = 100;
  }

  return params;
}

/* ---------------------------
   Загрузка каталога
--------------------------- */

async function loadMovies(reset = false) {
  if (state.loading) return;

  if (reset) {
    state.page = 1;
    state.movies = [];
  }

  if (reset) {
    $("movieGrid").innerHTML =
      '<div class="empty-state">Загружаем фильмы…</div>';
  }

  if (!getApiKey() ||
      getApiKey() === "ВСТАВЬ_СВОЙ_TMDB_API_KEY") {
    $("movieGrid").innerHTML = `
      <div class="empty-state">
        <h3>Нужно добавить ключ TMDB</h3>
        <p>В начале файла app.js замени ВСТАВЬ_СВОЙ_TMDB_API_KEY на свой API Key v3.</p>
      </div>
    `;

    $("resultCount").textContent = "Нет ключа API";
    $("loadMore").hidden = true;
    return;
  }

  const requestId = ++state.requestId;
  state.loading = true;
  $("loadMore").disabled = true;

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
      path = "/discover/movie";
      params = currentParams(state.page);
    }

    const data = await api(path, params);

    // Не показываем устаревший ответ поиска.
    if (requestId !== state.requestId) return;

    state.totalPages = Math.min(data.total_pages || 1, 500);
    state.totalResults = data.total_results || 0;

    const incoming = data.results || [];

    state.movies = reset
      ? incoming
      : state.movies.concat(incoming);

    renderMovies();

    $("resultCount").textContent =
      `${state.totalResults.toLocaleString("ru-RU")} результатов`;

    $("loadMore").hidden =
      state.page >= state.totalPages || incoming.length === 0;

  } catch (error) {
    if (requestId !== state.requestId) return;

    let message = "Не удалось загрузить каталог.";

    if (error.message === "NO_API_KEY") {
      message = "Добавь ключ TMDB в начале app.js.";
    } else if (error.message === "INVALID_API_KEY") {
      message = "TMDB отклонил ключ. Проверь правильность API Key v3.";
    } else if (error.message === "RATE_LIMIT") {
      message = "Слишком много запросов. Попробуй немного позже.";
    }

    $("movieGrid").innerHTML =
      `<div class="empty-state">${escapeHtml(message)}</div>`;

    $("resultCount").textContent = "Ошибка загрузки";
    $("loadMore").hidden = true;

  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      $("loadMore").disabled = false;
    }
  }
}

/* ---------------------------
   Карточки фильмов
--------------------------- */

function visibleMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");

  let movies = [...state.movies];

  if (state.selectedFilter === "favorites") {
    movies = movies.filter(movie => favorites.has(movie.id));
  }

  if (state.selectedFilter === "watched") {
    movies = movies.filter(movie => watched.has(movie.id));
  }

  return movies;
}

function renderMovies() {
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  const movies = visibleMovies();

  if (!movies.length) {
    $("movieGrid").innerHTML =
      '<div class="empty-state">Фильмов здесь пока нет. Попробуй изменить фильтры.</div>';
    return;
  }

  $("movieGrid").innerHTML = movies.map(movie => {
    const id = Number(movie.id);
    const title = escapeHtml(titleOf(movie));
    const poster = imageUrl(movie.poster_path);
    const rating = Number(movie.vote_average || 0).toFixed(1);
    const genres = (movie.genre_ids || [])
      .map(genreId => GENRES[genreId])
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");

    return `
      <article class="movie-card">
        <div
          class="poster-wrap"
          data-open="${id}"
          role="button"
          tabindex="0"
          aria-label="Подробнее: ${title}"
        >
          ${
            poster
              ? `<img
                  loading="lazy"
                  src="${poster}"
                  alt="Постер: ${title}"
                  onerror="this.style.display='none';this.nextElementSibling.hidden=false"
                >`
              : ""
          }
          <div class="poster-fallback" ${poster ? "hidden" : ""}>
            🎬<br>${title}
          </div>
          <span class="rating">★ ${rating}</span>
        </div>

        <div class="movie-card-body">
          <h3 class="movie-title" data-open="${id}">${title}</h3>
          <div class="movie-year">${yearOf(movie)} · ${escapeHtml(genres)}</div>

          <div class="card-actions">
            <button
              class="${favorites.has(id) ? "selected" : ""}"
              data-action="favorite"
              data-id="${id}"
              aria-label="Избранное"
              title="Избранное"
            >${favorites.has(id) ? "♥" : "♡"}</button>

            <button
              class="${watched.has(id) ? "selected" : ""}"
              data-action="watched"
              data-id="${id}"
              aria-label="Просмотрено"
              title="Просмотрено"
            >${watched.has(id) ? "✓" : "＋"}</button>

            <button
              data-action="details"
              data-id="${id}"
              aria-label="Подробнее"
              title="Подробнее"
            >•••</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function toggleItem(key, id) {
  const items = getSet(key);

  if (items.has(id)) {
    items.delete(id);
  } else {
    items.add(id);
  }

  write(key, [...items]);
  renderMovies();
  renderProfile();
}

/* ---------------------------
   Подробности фильма
--------------------------- */

async function openMovie(id) {
  let movie = state.movies.find(item => Number(item.id) === Number(id));

  try {
    movie = await api("/movie/" + id);
  } catch (error) {
    if (!movie) {
      showToast("Не удалось загрузить информацию о фильме");
      return;
    }
  }

  if (!movie) {
    showToast("Фильм не найден");
    return;
  }

  state.currentMovie = movie;

  const title = titleOf(movie);
  const poster = imageUrl(movie.poster_path);
  const favorites = getSet("favorites");
  const watched = getSet("watched");
  const reviews = read("reviews", {});
  const review = reviews[movie.id] || {};

  const genres = (
    movie.genres ||
    (movie.genre_ids || []).map(id => ({ name: GENRES[id] }))
  ).map(item => item.name).filter(Boolean).join(", ");

  $("movieDetails").innerHTML = `
    <div class="detail-layout">
      ${
        poster
          ? `<img src="${poster}" alt="Постер ${escapeHtml(title)}">`
          : ""
      }

      <div>
        <div class="eyebrow">КАРТОЧКА ФИЛЬМА</div>
        <h2>${escapeHtml(title)}</h2>

        <p class="muted">
          ${yearOf(movie)} · ★ ${Number(movie.vote_average || 0).toFixed(1)}
        </p>

        <p>${escapeHtml(genres || "Жанр не указан")}</p>

        <p>${escapeHtml(movie.overview || "Описание пока отсутствует.")}</p>

        <div class="detail-actions">
          <button class="button secondary" id="detailFavorite">
            ${favorites.has(movie.id) ? "♥ В избранном" : "♡ В избранное"}
          </button>

          <button class="button secondary" id="detailWatched">
            ${watched.has(movie.id) ? "✓ Просмотрено" : "＋ Просмотрено"}
          </button>
        </div>
      </div>
    </div>

    <div class="review-form">
      <h3>Моя оценка и отзыв</h3>

      <label>
        Оценка от 1 до 10
        <select id="reviewRating">
          ${Array.from({ length: 10 }, (_, index) => {
            const value = index + 1;
            return `<option value="${value}" ${
              Number(review.rating) === value ? "selected" : ""
            }>${value}/10</option>`;
          }).join("")}
        </select>
      </label>

      <textarea id="reviewText" placeholder="Что ты думаешь об этом фильме?">${escapeHtml(review.text || "")}</textarea>

      <button class="button primary" id="saveReview">Сохранить отзыв</button>

      <p class="muted small">
        Отзывы пока хранятся только в этом браузере.
      </p>
    </div>
  `;

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
    const allReviews = read("reviews", {});

    allReviews[movie.id] = {
      title,
      rating: Number($("reviewRating").value),
      text: $("reviewText").value.trim(),
      date: new Date().toISOString()
    };

    write("reviews", allReviews);
    renderProfile();
    showToast("Отзыв сохранён");
  };
}

/* ---------------------------
   Профиль
--------------------------- */

function renderProfile() {
  const profile = read("profile", {
    name: "Киноман",
    emoji: "🎬"
  });

  const name = profile.name || "Киноман";
  const emoji = profile.emoji || "🎬";

  $("sideName").textContent = name;
  $("topName").textContent = name;
  $("welcomeTitle").textContent = `С возвращением, ${name}!`;

  $("sideAvatar").textContent = emoji;
  $("topAvatar").textContent = emoji;
  $("profileAvatar").textContent = emoji;

  $("profileName").value = name;
  $("profileEmoji").value = emoji;

  $("statWatched").textContent = getSet("watched").size;
  $("statFavorites").textContent = getSet("favorites").size;
  $("statRecords").textContent = read("records", []).length;

  const reviews = Object.values(read("reviews", {}));

  $("myReviews").innerHTML = reviews.length
    ? reviews.map(review => `
        <div class="review-item">
          <strong>
            ${escapeHtml(review.title)} · ★ ${Number(review.rating)}/10
          </strong>
          <p>${escapeHtml(review.text || "Без комментария")}</p>
        </div>
      `).join("")
    : '<div class="empty-state">Пока нет отзывов.</div>';
}

/* ---------------------------
   Таблица рекордов
--------------------------- */

function renderRecords() {
  const records = read("records", [])
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  $("leaderboardList").innerHTML = records.length
    ? records.map((record, index) => `
        <div class="record-row">
          <span>${index + 1}</span>
          <strong>${escapeHtml(record.name)}</strong>
          <span>★ ${Number(record.score) || 0}</span>
        </div>
      `).join("")
    : '<div class="empty-state">Сыграй первый раунд!</div>';
}

/* ---------------------------
   Настройки и темы
--------------------------- */

function openSettings() {
  $("themeSelect").value = document.body.dataset.theme || "dark";
  $("settingsModal").hidden = false;
}

window.openSettings = openSettings;

function setTheme(theme) {
  const allowed = ["dark", "light", "violet", "ocean"];
  const selected = allowed.includes(theme) ? theme : "dark";

  document.body.dataset.theme = selected;

  try {
    localStorage.setItem("kp_theme", selected);
  } catch {}
}

/* ---------------------------
   Авторизация Яндекса
--------------------------- */

function setupAuth() {
  $("loginButton").onclick = () => {
    location.href = AUTH + "/login";
  };

  fetch(AUTH + "/me", {
    credentials: "include"
  })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      const user = data && (data.user || data);

      if (user && (
        user.login ||
        user.display_name ||
        user.real_name
      )) {
        const name =
          user.display_name ||
          user.real_name ||
          user.login;

        $("authArea").innerHTML = `
          <span class="muted">${escapeHtml(name)}</span>
        `;

        $("sideStatus").textContent = "Вошли через Яндекс";
      }
    })
    .catch(() => {
      $("sideStatus").textContent = "Локальный профиль";
    });
}

/* ---------------------------
   Игра «Угадай фильм»
--------------------------- */

function startGame() {
  const pool = state.movies.filter(movie => movie.poster_path);

  if (pool.length < 2) {
    showToast("Сначала загрузи фильмы с постерами");
    return;
  }

  const shuffled = [...pool];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] =
      [shuffled[randomIndex], shuffled[index]];
  }

  const count = Math.min(
    Number($("roundCount").value) || 10,
    shuffled.length
  );

  state.game = {
    pool: shuffled.slice(0, count),
    index: 0,
    hearts: 5,
    score: 0,
    usedHint: false,
    answered: false,
    started: Date.now()
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

  game.answered = false;
  game.usedHint = false;

  $("roundLabel").textContent =
    `Раунд ${game.index + 1} / ${game.pool.length}`;

  $("gameScore").textContent = `Очки: ${game.score}`;

  $("heartBar").textContent =
    "♥ ".repeat(game.hearts) + "♡ ".repeat(5 - game.hearts);

  $("gamePoster").src = imageUrl(movie.poster_path);
  $("gamePoster").alt = "Постер фильма";

  $("gamePrompt").textContent = "Угадай название фильма";
  $("guessInput").value = "";
  $("guessInput").disabled = false;
  $("submitGuess").disabled = false;
  $("gameFeedback").textContent = "";
  $("nextRound").hidden = true;

  document.querySelectorAll(".hint-button").forEach(button => {
    button.disabled = false;
  });
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLocaleLowerCase("ru")
    .replace(/[ё]/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function answerGuess() {
  const game = state.game;

  if (!game || game.answered) return;

  const answer = normalizeAnswer($("guessInput").value);

  if (!answer) {
    showToast("Введи название фильма");
    return;
  }

  const movie = game.pool[game.index];

  const acceptedAnswers = [
    titleOf(movie),
    movie.original_title || ""
  ].map(normalizeAnswer).filter(Boolean);

  if (acceptedAnswers.includes(answer)) {
    game.score += 100 + game.hearts * 10;

    $("gameFeedback").textContent =
      "Верно! Отличное знание кино 🎉";

    $("gameFeedback").style.color = "var(--accent)";
  } else {
    $("gameFeedback").textContent =
      `Правильный ответ: ${titleOf(movie)}`;

    $("gameFeedback").style.color = "#fca5a5";
  }

  game.answered = true;

  $("guessInput").disabled = true;
  $("submitGuess").disabled = true;
  $("nextRound").hidden = false;
  $("gameScore").textContent = `Очки: ${game.score}`;

  document.querySelectorAll(".hint-button").forEach(button => {
    button.disabled = true;
  });
}

function useHint(type) {
  const game = state.game;

  if (!game || game.answered) return;

  if (game.hearts <= 0) {
    showToast("Сердца закончились");
    return;
  }

  const movie = game.pool[game.index];

  game.hearts--;

  let hint = "";

  if (type === "year") {
    hint = "Год выхода: " + yearOf(movie);
  }

  if (type === "genre") {
    const names = (movie.genre_ids || [])
      .map(id => GENRES[id])
      .filter(Boolean);

    hint = "Жанр: " + (names.join(", ") || "неизвестен");
  }

  if (type === "letter") {
    hint = "Первая буква: " + titleOf(movie).charAt(0);
  }

  $("gamePrompt").textContent = hint;

  $("heartBar").textContent =
    "♥ ".repeat(game.hearts) + "♡ ".repeat(5 - game.hearts);

  const button = document.querySelector(
    `.hint-button[data-hint="${type}"]`
  );

  if (button) button.disabled = true;
}

function finishGame() {
  const game = state.game;

  if (!game) return;

  $("gamePlay").hidden = true;
  $("gameResults").hidden = false;

  const profile = read("profile", { name: "Киноман" });
  const name =
    $("playerName").value.trim() ||
    profile.name ||
    "Киноман";

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
    <p>Твой результат: <strong>${game.score} очков</strong></p>
    <button class="button primary" id="playAgain">
      Сыграть ещё раз
    </button>
  `;

  $("playAgain").onclick = () => {
    $("gameSetup").hidden = false;
    $("gameResults").hidden = true;
  };

  renderRecords();
  renderProfile();
}

/* ---------------------------
   Сюрприз
--------------------------- */

async function surprise() {
  let pool = state.movies.filter(movie => movie.poster_path);

  if (!pool.length) {
    try {
      const data = await api("/discover/movie", {
        page: 1,
        sort_by: "popularity.desc",
        include_adult: "false"
      });

      pool = (data.results || [])
        .filter(movie => movie.poster_path);
    } catch {
      location.hash = "catalog";
      showToast("Не удалось загрузить случайный фильм");
      return;
    }
  }

  if (!pool.length) {
    showToast("Не удалось найти фильм");
    return;
  }

  const movie = pool[Math.floor(Math.random() * pool.length)];
  openMovie(movie.id);
}

/* ---------------------------
   Вспомогательные функции
--------------------------- */

function debounce(callback, delay) {
  let timer;

  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

/* ---------------------------
   События интерфейса
--------------------------- */

function bindEvents() {
  $("searchInput").addEventListener(
    "input",
    debounce(() => {
      state.query = $("searchInput").value.trim();
      state.page = 1;
      loadMovies(true);
    }, 450)
  );

  $("genreSelect").onchange = () => {
    state.genre = $("genreSelect").value;
    state.query = "";
    $("searchInput").value = "";
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

  $("loadMore").onclick = async () => {
    if (state.loading || state.page >= state.totalPages) return;

    state.page++;
    await loadMovies(false);
  };

  $("quickFilters").onclick = event => {
    const button = event.target.closest("[data-filter]");

    if (!button) return;

    state.selectedFilter = button.dataset.filter;

    document.querySelectorAll(".filter-tab").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderMovies();
  };

  $("movieGrid").addEventListener("click", event => {
    const action = event.target.closest("[data-action]");

    if (action) {
      const id = Number(action.dataset.id);

      if (action.dataset.action === "favorite") {
        toggleItem("favorites", id);
      }

      if (action.dataset.action === "watched") {
        toggleItem("watched", id);
      }

      if (action.dataset.action === "details") {
        openMovie(id);
      }

      return;
    }

    const open = event.target.closest("[data-open]");

    if (open) {
      openMovie(Number(open.dataset.open));
    }
  });

  $("movieGrid").addEventListener("keydown", event => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target.matches("[data-open]")
    ) {
      event.preventDefault();
      openMovie(Number(event.target.dataset.open));
    }
  });

  $("surpriseButton").onclick = surprise;

  $("themeToggle").onclick = () => {
    const themes = ["dark", "light", "violet", "ocean"];
    const current = document.body.dataset.theme || "dark";
    const next = (themes.indexOf(current) + 1) % themes.length;

    setTheme(themes[next]);
  };

  $("profileShortcut").onclick = () => {
    location.hash = "profile";
  };

  $("openSettings").onclick = openSettings;

  $("closeSettings").onclick = () => {
    $("settingsModal").hidden = true;
  };

  $("themeSelect").onchange = () => {
    setTheme($("themeSelect").value);
  };

  $("languageSelect").onchange = () => {
    showToast("Перевод интерфейса пока не подключён");
  };

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => {
      const modal = $(button.dataset.close);
      if (modal) modal.hidden = true;
    };
  });

  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) {
        backdrop.hidden = true;
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-backdrop").forEach(modal => {
        modal.hidden = true;
      });
    }
  });

  $("saveProfile").onclick = () => {
    write("profile", {
      name: $("profileName").value.trim() || "Киноман",
      emoji: $("profileEmoji").value
    });

    renderProfile();
    showToast("Профиль сохранён");
  };

  $("startGame").onclick = startGame;
  $("submitGuess").onclick = answerGuess;

  $("guessInput").addEventListener("keydown", event => {
    if (event.key === "Enter") answerGuess();
  });

  $("nextRound").onclick = () => {
    if (!state.game) return;
    state.game.index++;
    showRound();
  };

  document.querySelectorAll(".hint-button").forEach(button => {
    button.onclick = () => useHint(button.dataset.hint);
  });
}

/* ---------------------------
   Запуск приложения
--------------------------- */

function init() {
  setupFilters();
  bindEvents();

  setTheme(read("theme", "dark"));

  renderProfile();
  renderRecords();
  setupAuth();

  loadMovies(true);
}

init();
