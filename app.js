
const TMDB_KEY = "2bb8c24e985622869c01b9ced2972ebe";
const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/";
const AUTH = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";

const KEYS = {
  profile: "kp_profile",
  favorites: "kp_favorites",
  watched: "kp_watched",
  reviews: "kp_reviews",
  records: "kp_records",
  playlists: "kp_playlists",
  theme: "kp_theme",
  language: "kp_language"
};

const GENRES = {
  28: "Боевик", 12: "Приключения", 16: "Мультфильм",
  35: "Комедия", 80: "Криминал", 99: "Документальный",
  18: "Драма", 10751: "Семейный", 14: "Фэнтези",
  36: "История", 27: "Ужасы", 10402: "Музыка",
  9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика",
  10770: "Телефильм", 53: "Триллер", 10752: "Военный",
  37: "Вестерн"
};

const $ = (id) => document.getElementById(id);

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getSet(key) {
  return new Set(read(key, []));
}

function saveSet(key, set) {
  write(key, [...set]);
}

const state = {
  page: "home",
  movies: [],
  totalPages: 1,
  pageNumber: 1,
  query: "",
  genre: "",
  year: "",
  sort: "popularity.desc",
  loading: false,
  requestId: 0,
  gameMovies: [],
  gameIndex: 0,
  gameScore: 0,
  gameHints: 0,
  gameUsedHints: new Set(),
  user: null
};

let favorites = getSet(KEYS.favorites);
let watched = getSet(KEYS.watched);
let reviews = read(KEYS.reviews, []);
let records = read(KEYS.records, []);
let playlists = read(KEYS.playlists, []);
let profile = read(KEYS.profile, {
  name: "Киноман",
  emoji: "🎬"
});

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    console.log(message);
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function api(path, params = {}) {
  if (!TMDB_KEY || TMDB_KEY.includes("ВСТАВЬ_")) {
    throw new Error("Добавь новый ключ TMDB в начало app.js.");
  }

  const url = new URL(API + path);
  url.searchParams.set("api_key", TMDB_KEY);
  url.searchParams.set("language", "ru-RU");

  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`TMDB: ошибка ${response.status}`);
  return response.json();
}

function poster(movie, size = "w500") {
  return movie?.poster_path
    ? `${IMAGE}${size}${movie.poster_path}`
    : "";
}

function backdrop(movie, size = "w780") {
  return movie?.backdrop_path
    ? `${IMAGE}${size}${movie.backdrop_path}`
    : poster(movie, size);
}

function movieTitle(movie) {
  return movie?.title || movie?.name || "Без названия";
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[char]);
}

function getMovieId(movie) {
  return String(movie.id);
}

function movieGenres(movie) {
  return (movie.genre_ids || movie.genres?.map(g => g.id) || [])
    .map(id => GENRES[id])
    .filter(Boolean);
}

function renderMovieCard(movie) {
  const id = getMovieId(movie);
  const isFav = favorites.has(id);
  const isWatched = watched.has(id);
  const image = poster(movie);

  return `
    <article class="movie-card" data-movie-id="${id}">
      <button class="movie-card__open" data-action="details"
        data-id="${id}" aria-label="О фильме ${escapeHTML(movieTitle(movie))}">
        ${image
          ? `<img src="${image}" alt="${escapeHTML(movieTitle(movie))}" loading="lazy">`
          : `<div class="movie-placeholder">🎬</div>`}
        <span class="movie-rating">★ ${Number(movie.vote_average || 0).toFixed(1)}</span>
      </button>
      <div class="movie-card__info">
        <h3>${escapeHTML(movieTitle(movie))}</h3>
        <p>${(movie.release_date || "").slice(0, 4) || "Год неизвестен"}</p>
        <div class="movie-card__actions">
          <button data-action="favorite" data-id="${id}" aria-label="Избранное">
            ${isFav ? "♥" : "♡"}
          </button>
          <button data-action="watched" data-id="${id}" aria-label="Просмотрено">
            ${isWatched ? "✓" : "＋"}
          </button>
          <button data-action="details" data-id="${id}">Подробнее</button>
        </div>
      </div>
    </article>`;
}

function renderMovies() {
  const grid = $("movieGrid");
  if (!grid) return;

  grid.innerHTML = state.movies.map(renderMovieCard).join("");

  if ($("resultCount")) {
    $("resultCount").textContent = `Найдено: ${state.movies.length}`;
  }

  if ($("loadMore")) {
    $("loadMore").hidden = state.pageNumber >= state.totalPages;
  }
}

async function loadMovies(append = false) {
  const requestId = ++state.requestId;
  state.loading = true;

  const grid = $("movieGrid");
  if (grid && !append) grid.innerHTML = "<p>Загружаем фильмы…</p>";

  try {
    const params = {
      page: append ? state.pageNumber + 1 : 1,
      sort_by: state.sort,
      include_adult: false,
      ...(state.query ? { query: state.query } : {}),
      ...(state.genre && !state.query ? { with_genres: state.genre } : {}),
      ...(state.year && !state.query ? { primary_release_year: state.year } : {})
    };

    const path = state.query ? "/search/movie" : "/discover/movie";
    const data = await api(path, params);

    // Не показываем ответ от старого поиска, если пользователь уже ввёл новый.
    if (requestId !== state.requestId) return;

    state.pageNumber = params.page;
    state.totalPages = Math.min(data.total_pages || 1, 500);
    state.movies = append
      ? [...state.movies, ...(data.results || [])]
      : (data.results || []);

    renderMovies();
  } catch (error) {
    if (requestId === state.requestId && grid) {
      grid.innerHTML = `<p>${escapeHTML(error.message || "Не удалось загрузить фильмы.")}</p>`;
    }
  } finally {
    if (requestId === state.requestId) state.loading = false;
  }
}

function toggleSet(set, key, id) {
  id = String(id);
  set.has(id) ? set.delete(id) : set.add(id);
  saveSet(key, set);
  renderMovies();
  renderProfile();
  scheduleSync();
}

async function openMovie(id) {
  try {
    const movie = await api(`/movie/${id}`, {
      append_to_response: "credits,videos"
    });

    const details = $("movieDetails");
    if (!details) return;

    const image = backdrop(movie);
    const cast = (movie.credits?.cast || [])
      .slice(0, 5).map(person => escapeHTML(person.name)).join(", ");

    details.innerHTML = `
      ${image ? `<img class="movie-details__backdrop" src="${image}" alt="">` : ""}
      <h2>${escapeHTML(movieTitle(movie))}</h2>
      <p>★ ${Number(movie.vote_average || 0).toFixed(1)} ·
        ${(movie.release_date || "").slice(0, 4)}</p>
      <p>${escapeHTML(movieGenres(movie).join(", "))}</p>
      <p>${escapeHTML(movie.overview || "Описание отсутствует.")}</p>
      ${cast ? `<p><b>В ролях:</b> ${cast}</p>` : ""}
      <button data-action="favorite" data-id="${movie.id}">
        ${favorites.has(String(movie.id)) ? "♥ В избранном" : "♡ В избранное"}
      </button>
      <button data-action="watched" data-id="${movie.id}">
        ${watched.has(String(movie.id)) ? "✓ Просмотрено" : "＋ Просмотрено"}
      </button>
      <form id="reviewForm" data-id="${movie.id}">
        <label>Твоя оценка
          <select name="rating">
            ${[5,4,3,2,1].map(n => `<option value="${n}">${n} / 5</option>`).join("")}
          </select>
        </label>
        <textarea name="text" maxlength="1000" placeholder="Напиши отзыв…"></textarea>
        <button type="submit">Сохранить отзыв</button>
      </form>`;

    const modal = $("movieModal");
    if (modal) {
      if (typeof modal.showModal === "function") modal.showModal();
      else modal.classList.add("open");
    }
  } catch {
    notify("Не удалось открыть карточку фильма.");
  }
}

function saveReview(movieId, rating, text) {
  const item = {
    movieId: String(movieId),
    rating: Number(rating),
    text: String(text).trim(),
    date: new Date().toISOString()
  };

  reviews = reviews.filter(r => r.movieId !== item.movieId);
  reviews.unshift(item);
  write(KEYS.reviews, reviews);
  renderProfile();
  scheduleSync();
  notify("Отзыв сохранён.");
}

function renderProfile() {
  const name = state.user?.name || profile.name || "Киноман";
  const avatar = state.user?.avatar || "";

  ["sideName", "topName", "profileName"].forEach(id => {
    const el = $(id);
    if (el && id !== "profileName") el.textContent = name;
    if (el === $("profileName") && document.activeElement !== el) el.value = name;
  });

  ["sideAvatar", "topAvatar", "profileAvatar"].forEach(id => {
    const el = $(id);
    if (!el) return;
    if (avatar) {
      if (el.tagName === "IMG") {
        el.src = avatar;
        el.alt = name;
      } else {
        el.innerHTML = `<img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)}">`;
      }
    } else if (el.tagName !== "IMG") {
      el.textContent = profile.emoji || "🎬";
    }
  });

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  setText("favoritesCount", favorites.size);
  setText("watchedCount", watched.size);
  setText("reviewsCount", reviews.length);

  const reviewBox = $("myReviews");
  if (reviewBox) {
    reviewBox.innerHTML = reviews.length
      ? reviews.map(r => `
        <article class="review-item">
          <b>${escapeHTML(r.movieTitle || `Фильм #${r.movieId}`)}</b>
          <span>★ ${r.rating}/5</span>
          <p>${escapeHTML(r.text)}</p>
        </article>`).join("")
      : "<p>Пока нет отзывов.</p>";
  }

  renderPlaylistManager();
}

function setPage(page) {
  const allowed = ["home", "catalog", "game", "records", "profile"];
  if (!allowed.includes(page)) page = "home";
  state.page = page;

  document.querySelectorAll(".main > section.section, .main > section.hero")
    .forEach(section => {
      section.classList.toggle("page-active", section.id === page);
    });

  document.querySelectorAll("[data-page], .sidebar a[href^='#']")
    .forEach(link => {
      const target = link.dataset.page || link.getAttribute("href")?.slice(1);
      link.classList.toggle("active", target === page);
    });

  if (location.hash !== `#${page}`) {
    history.replaceState(null, "", `#${page}`);
  }
}

function setupNavigation() {
  document.addEventListener("click", event => {
    const link = event.target.closest("[data-page], .sidebar a[href^='#']");
    if (!link) return;

    const page = link.dataset.page || link.getAttribute("href")?.slice(1);
    if (["home", "catalog", "game", "records", "profile"].includes(page)) {
      event.preventDefault();
      setPage(page);
    }
  });

  window.addEventListener("hashchange", () => {
    setPage(location.hash.slice(1));
  });

  setPage(location.hash.slice(1) || "home");
}

function setupFilters() {
  const search = $("searchInput");
  let timer;

  search?.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.query = search.value.trim();
      loadMovies(false);
    }, 350);
  });

  $("genreSelect")?.addEventListener("change", event => {
    state.genre = event.target.value;
    loadMovies(false);
  });

  $("yearSelect")?.addEventListener("change", event => {
    state.year = event.target.value;
    loadMovies(false);
  });

  $("sortSelect")?.addEventListener("change", event => {
    state.sort = event.target.value;
    loadMovies(false);
  });

  $("loadMore")?.addEventListener("click", () => {
    if (!state.loading && state.pageNumber < state.totalPages) loadMovies(true);
  });
}

function setupMovieActions() {
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "favorite") toggleSet(favorites, KEYS.favorites, id);
    if (action === "watched") toggleSet(watched, KEYS.watched, id);
    if (action === "details") openMovie(id);
    if (action === "delete-playlist") deletePlaylist(id);
    if (action === "play-playlist") startPlaylistGame(id);
    if (action === "remove-from-playlist") removeFromPlaylist(id, button.dataset.movie);
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "reviewForm") {
      event.preventDefault();
      const form = event.target;
      const movieId = form.dataset.id;
      const movie = state.movies.find(m => String(m.id) === String(movieId));
      const text = form.elements.text.value;

      reviews = reviews.filter(r => r.movieId !== String(movieId));
      reviews.unshift({
        movieId: String(movieId),
        movieTitle: movie ? movieTitle(movie) : `Фильм #${movieId}`,
        rating: Number(form.elements.rating.value),
        text: text.trim(),
        date: new Date().toISOString()
      });

      write(KEYS.reviews, reviews);
      renderProfile();
      scheduleSync();
      notify("Отзыв сохранён.");
    }
  });
}

/* Плейлисты: сохраняются локально, а при подключённом Worker
   могут дополнительно синхронизироваться через D1. */
function ensurePlaylistUI() {
  const profileSection = $("profile");
  if (!profileSection || $("playlistManager")) return;

  const container = document.createElement("section");
  container.id = "playlistManager";
  container.className = "playlist-manager";
  container.innerHTML = `
    <h2>Мои плейлисты</h2>
    <form id="playlistForm">
      <input name="name" maxlength="60" required placeholder="Название подборки">
      <textarea name="description" maxlength="300" placeholder="Описание (необязательно)"></textarea>
      <label><input type="checkbox" name="public"> Публичный плейлист</label>
      <button type="submit">Создать плейлист</button>
    </form>
    <div id="playlistList"></div>`;
  profileSection.appendChild(container);

  container.querySelector("#playlistForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    if (!name) return;

    playlists.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      description: form.elements.description.value.trim(),
      isPublic: form.elements.public.checked,
      movieIds: [],
      createdAt: new Date().toISOString()
    });

    write(KEYS.playlists, playlists);
    form.reset();
    renderPlaylistManager();
    scheduleSync();
    notify("Плейлист создан.");
  });
}

function renderPlaylistManager() {
  const list = $("playlistList");
  if (!list) return;

  list.innerHTML = playlists.map(p => `
    <article class="playlist-card">
      <h3>${escapeHTML(p.name)}</h3>
      <p>${escapeHTML(p.description || "")}</p>
      <small>${p.isPublic ? "Публичный" : "Приватный"} · ${p.movieIds.length} фильмов</small>
      <div class="playlist-actions">
        <button data-action="play-playlist" data-id="${escapeHTML(p.id)}"
          ${p.movieIds.length ? "" : "disabled"}>Играть по плейлисту</button>
        <button data-action="delete-playlist" data-id="${escapeHTML(p.id)}">Удалить</button>
      </div>
      <label>Добавить фильм
        <select data-playlist-add="${escapeHTML(p.id)}">
          <option value="">Выбери фильм из каталога</option>
          ${state.movies.map(m => `
            <option value="${m.id}">${escapeHTML(movieTitle(m))}</option>
          `).join("")}
        </select>
      </label>
      <button data-add-to-playlist="${escapeHTML(p.id)}">Добавить выбранный фильм</button>
      <div class="playlist-movies">
        ${p.movieIds.map(id => {
          const movie = state.movies.find(m => String(m.id) === String(id));
          return `<span>${escapeHTML(movie ? movieTitle(movie) : `Фильм #${id}`)}
            <button data-action="remove-from-playlist" data-id="${escapeHTML(p.id)}"
              data-movie="${escapeHTML(id)}" aria-label="Удалить фильм">×</button>
          </span>`;
        }).join("")}
      </div>
    </article>`).join("") || "<p>Создай свой первый плейлист.</p>";

  list.querySelectorAll("[data-add-to-playlist]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.addToPlaylist;
      const select = list.querySelector(`[data-playlist-add="${CSS.escape(id)}"]`);
      if (!select?.value) {
        notify("Сначала выбери фильм.");
        return;
      }
      const playlist = playlists.find(p => p.id === id);
      if (!playlist) return;
      if (!playlist.movieIds.includes(String(select.value))) {
        playlist.movieIds.push(String(select.value));
      }
      write(KEYS.playlists, playlists);
      renderPlaylistManager();
      scheduleSync();
      notify("Фильм добавлен.");
    });
  });
}

function deletePlaylist(id) {
  playlists = playlists.filter(p => p.id !== id);
  write(KEYS.playlists, playlists);
  renderPlaylistManager();
  scheduleSync();
  notify("Плейлист удалён.");
}

function removeFromPlaylist(playlistId, movieId) {
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;
  playlist.movieIds = playlist.movieIds.filter(id => id !== String(movieId));
  write(KEYS.playlists, playlists);
  renderPlaylistManager();
  scheduleSync();
}

async function getGameMovies() {
  const data = await api("/discover/movie", {
    sort_by: "popularity.desc",
    "vote_count.gte": 100,
    "with_backdrops": true,
    page: Math.floor(Math.random() * 5) + 1
  });
  return (data.results || []).filter(m => m.backdrop_path || m.poster_path);
}

function showGameMovie(movie) {
  const image = $("gamePoster");
  if (image) {
    image.src = backdrop(movie, "w1280");
    image.alt = "Кадр из фильма";
  }

  const prompt = $("gamePrompt");
  if (prompt) prompt.textContent = "Угадай фильм по кадру";

  if ($("guessInput")) {
    $("guessInput").value = "";
    $("guessInput").disabled = false;
    $("guessInput").focus();
  }

  ["year", "genre", "letter"].forEach(type => {
    const button = document.querySelector(`[data-hint="${type}"]`);
    if (button) button.disabled = false;
  });
}

async function startGame(customMovies = null) {
  try {
    let pool = customMovies;

    if (!pool) {
      pool = await getGameMovies();
    } else {
      pool = pool.filter(m => m && (m.backdrop_path || m.poster_path));
    }

    if (!pool.length) {
      notify("Не нашёл фильмы для игры. Попробуй ещё раз.");
      return;
    }

    const rounds = Math.max(1, Math.min(30, Number($("roundCount")?.value || 10)));
    state.gameMovies = pool.sort(() => Math.random() - 0.5).slice(0, rounds);
    state.gameIndex = 0;
    state.gameScore = 0;
    state.gameHints = 0;
    state.gameUsedHints = new Set();

    if ($("gameSetup")) $("gameSetup").hidden = true;
    if ($("gamePlay")) $("gamePlay").hidden = false;
    if ($("gameResults")) $("gameResults").hidden = true;

    showGameMovie(state.gameMovies[0]);
  } catch (error) {
    notify(error.message || "Не удалось начать игру.");
  }
}

function finishRound(correct) {
  const movie = state.gameMovies[state.gameIndex];
  if (!movie) return;

  const input = $("guessInput");
  if (input) input.disabled = true;

  if (correct) {
    state.gameScore += Math.max(1, 10 - state.gameHints * 2);
    if ($("gamePrompt")) $("gamePrompt").textContent = `Верно! Это «${movieTitle(movie)}».`;
  } else if ($("gamePrompt")) {
    $("gamePrompt").textContent = `Это «${movieTitle(movie)}».`;
  }

  if ($("nextRound")) $("nextRound").hidden = false;
}

function submitGuess() {
  const movie = state.gameMovies[state.gameIndex];
  const input = $("guessInput");
  if (!movie || !input) return;

  const guess = input.value.trim().toLocaleLowerCase("ru");
  const title = movieTitle(movie).toLocaleLowerCase("ru");
  const correct = guess === title || title.includes(guess) && guess.length >= 4;
  finishRound(correct);
}

async function startPlaylistGame(playlistId) {
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) return;

  try {
    const movies = await Promise.all(
      playlist.movieIds.map(id => api(`/movie/${id}`).catch(() => null))
    );
    const valid = movies.filter(Boolean);
    if (!valid.length) {
      notify("В этом плейлисте нет доступных фильмов.");
      return;
    }
    setPage("game");
    await startGame(valid);
  } catch {
    notify("Не удалось загрузить плейлист для игры.");
  }
}

function setupGame() {
  $("startGame")?.addEventListener("click", () => startGame());
  $("submitGuess")?.addEventListener("click", submitGuess);

  $("guessInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") submitGuess();
  });

  $("nextRound")?.addEventListener("click", () => {
    state.gameIndex++;
    state.gameHints = 0;
    state.gameUsedHints = new Set();

    if (state.gameIndex >= state.gameMovies.length) {
      const result = {
        name: profile.name || "Киноман",
        score: state.gameScore,
        date: new Date().toISOString()
      };
      records.push(result);
      records.sort((a, b) => b.score - a.score);
      records = records.slice(0, 100);
      write(KEYS.records, records);
      renderRecords();

      if ($("gamePlay")) $("gamePlay").hidden = true;
      if ($("gameResults")) {
        $("gameResults").hidden = false;
        $("gameResults").textContent =
          `Игра завершена! Твой результат: ${state.gameScore} очков.`;
      }

      scheduleSync();
      return;
    }

    if ($("nextRound")) $("nextRound").hidden = true;
    showGameMovie(state.gameMovies[state.gameIndex]);
  });

  document.querySelectorAll("[data-hint]").forEach(button => {
    button.addEventListener("click", () => {
      const movie = state.gameMovies[state.gameIndex];
      if (!movie) return;

      const type = button.dataset.hint;
      if (state.gameUsedHints.has(type)) return;

      state.gameUsedHints.add(type);
      state.gameHints++;
      button.disabled = true;

      const hint = type === "year"
        ? `Год: ${(movie.release_date || "").slice(0, 4) || "неизвестен"}`
        : type === "genre"
          ? `Жанр: ${movieGenres(movie).join(", ") || "неизвестен"}`
          : `Первая буква: ${movieTitle(movie).slice(0, 1)}`;

      notify(hint);
    });
  });
}

function renderRecords() {
  const list = $("leaderboardList");
  if (!list) return;

  list.innerHTML = records.length
    ? records.map((r, i) => `
      <li><span>${i + 1}. ${escapeHTML(r.name)}</span>
      <b>${Number(r.score) || 0} очков</b></li>`).join("")
    : "<li>Рекордов пока нет.</li>";
}

function setupProfile() {
  $("saveProfile")?.addEventListener("click", () => {
    const name = $("profileName")?.value.trim();
    const emoji = $("profileEmoji")?.value.trim();

    profile = {
      ...profile,
      name: name || "Киноман",
      emoji: emoji || "🎬"
    };

    write(KEYS.profile, profile);
    renderProfile();
    scheduleSync();
    notify("Профиль сохранён.");
  });
}

function setupTheme() {
  const theme = read(KEYS.theme, "dark");
  document.documentElement.dataset.theme = theme;
  if ($("themeSelect")) $("themeSelect").value = theme;

  $("themeSelect")?.addEventListener("change", event => {
    document.documentElement.dataset.theme = event.target.value;
    write(KEYS.theme, event.target.value);
  });

  const language = read(KEYS.language, "ru");
  if ($("languageSelect")) $("languageSelect").value = language;
  $("languageSelect")?.addEventListener("change", event => {
    write(KEYS.language, event.target.value);
    notify("Язык сохранён. Перевод интерфейса нужно подключить отдельно.");
  });
}

/* Вход и профиль Яндекса */
async function setupAuth() {
  $("loginButton")?.addEventListener("click", () => {
    location.href = `${AUTH}/login`;
  });

  try {
    const response = await fetch(`${AUTH}/me`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error("Не авторизован");

    const data = await response.json();
    if (data?.user) {
      state.user = {
        id: data.user.id || data.user.login || data.user.name,
        name: data.user.display_name || data.user.real_name ||
          data.user.name || profile.name,
        avatar: data.user.avatar_url || data.user.default_avatar_id
          ? (data.user.avatar_url || `https://avatars.yandex.net/get-yapic/${data.user.default_avatar_id}/islands-200`)
          : ""
      };

      renderProfile();

      if ($("authArea")) {
        $("authArea").innerHTML =
          `<span>Вы вошли как ${escapeHTML(state.user.name)}</span>
           <button id="logoutButton">Выйти</button>`;
      }

      $("logoutButton")?.addEventListener("click", async () => {
        try {
          await fetch(`${AUTH}/logout`, { credentials: "include" });
        } finally {
          state.user = null;
          location.reload();
        }
      });

      await syncFromWorker();
    }
  } catch {
    // Пользователь может пользоваться сайтом без входа.
  }
}

/* Синхронизация ожидает Worker-маршрут GET/PUT /api/data и D1 binding KP_DB.
   Пока маршрут не добавлен, сайт продолжит работать с localStorage. */
let syncTimer;

function collectData() {
  return {
    profile,
    favorites: [...favorites],
    watched: [...watched],
    reviews,
    records,
    playlists
  };
}

function applyData(data) {
  if (!data || typeof data !== "object") return;

  if (data.profile) {
    profile = { ...profile, ...data.profile };
    write(KEYS.profile, profile);
  }
  if (Array.isArray(data.favorites)) {
    favorites = new Set(data.favorites.map(String));
    saveSet(KEYS.favorites, favorites);
  }
  if (Array.isArray(data.watched)) {
    watched = new Set(data.watched.map(String));
    saveSet(KEYS.watched, watched);
  }
  if (Array.isArray(data.reviews)) {
    reviews = data.reviews;
    write(KEYS.reviews, reviews);
  }
  if (Array.isArray(data.records)) {
    records = data.records;
    write(KEYS.records, records);
  }
  if (Array.isArray(data.playlists)) {
    playlists = data.playlists;
    write(KEYS.playlists, playlists);
  }

  renderProfile();
  renderMovies();
  renderRecords();
}

async function syncFromWorker() {
  if (!state.user) return;
  try {
    const response = await fetch(`${AUTH}/api/data`, {
      credentials: "include"
    });
    if (!response.ok) return;
    const result = await response.json();
    if (result.data) applyData(result.data);
  } catch {
    // До настройки D1 локальные данные остаются доступны.
  }
}

async function syncToWorker() {
  if (!state.user) return;
  try {
    await fetch(`${AUTH}/api/data`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: collectData() })
    });
  } catch {
    // Сохранение в браузере уже выполнено.
  }
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToWorker, 700);
}

async function init() {
  setupNavigation();
  setupFilters();
  setupMovieActions();
  setupGame();
  setupProfile();
  setupTheme();
  ensurePlaylistUI();

  renderProfile();
  renderRecords();

  await setupAuth();
  await loadMovies();
}

document.addEventListener("DOMContentLoaded", init);
