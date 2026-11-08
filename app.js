(() => {
  "use strict";

  // =====================================================
  // НАСТРОЙКИ
  // =====================================================

  // Укажи НОВЫЙ ключ TMDB. Старый ключ уже публиковался
  // в коде, поэтому его лучше перевыпустить.
  // Безопаснее обращаться к TMDB через серверный Worker.
  const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";

  const TMDB = "https://api.themoviedb.org/3";
  const IMAGE = "https://image.tmdb.org/t/p/w500";
  const AUTH_URL = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";
  const STORAGE_KEY = "kinopod_data_v3";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const state = {
    section: "home",
    filter: "all",
    collection: "favorites",
    page: 1,
    totalPages: 1,
    movies: [],
    homeMovies: [],
    genres: [],
    selectedMovie: null,
    loading: false,
    requestId: 0,
    gameMovie: null,
    gameOptions: [],
    gameAnswered: false,
    gameScore: 0,
    user: null,
    toastTimer: null
  };

  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
        watched: Array.isArray(saved.watched) ? saved.watched : [],
        reviews: saved.reviews && typeof saved.reviews === "object" ? saved.reviews : {},
        playlists: Array.isArray(saved.playlists) ? saved.playlists : [],
        records: saved.records && typeof saved.records === "object" ? saved.records : {},
        settings: saved.settings && typeof saved.settings === "object" ? saved.settings : { theme: "dark" },
        score: Number(saved.score) || 0,
        cachedMovies: Array.isArray(saved.cachedMovies) ? saved.cachedMovies : []
      };
    } catch {
      return {
        favorites: [], watched: [], reviews: {}, playlists: [],
        records: {}, settings: { theme: "dark" }, score: 0, cachedMovies: []
      };
    }
  }

  let data = loadLocal();

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      showToast("Не удалось сохранить данные в браузере.");
    }
    updateProfile();
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function imageURL(path) {
    return path ? IMAGE + path : "";
  }

  function yearOf(movie) {
    return (movie.release_date || movie.first_air_date || "").slice(0, 4) || "Год неизвестен";
  }

  function titleOf(movie) {
    return movie.title || movie.name || "Без названия";
  }

  function ratingOf(movie) {
    const rating = Number(movie.vote_average);
    return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "—";
  }

  function normalizeMovie(movie) {
    return {
      ...movie,
      id: Number(movie.id),
      title: titleOf(movie),
      release_date: movie.release_date || movie.first_air_date || "",
      vote_average: Number(movie.vote_average) || 0
    };
  }

  function findMovie(id) {
    const numericId = Number(id);
    return state.movies.find(movie => Number(movie.id) === numericId)
      || state.homeMovies.find(movie => Number(movie.id) === numericId)
      || data.cachedMovies.find(movie => Number(movie.id) === numericId)
      || (state.selectedMovie && Number(state.selectedMovie.id) === numericId
        ? state.selectedMovie
        : null);
  }

  function rememberMovies(movies) {
    const combined = new Map();
    [...data.cachedMovies, ...state.homeMovies, ...state.movies, ...movies]
      .filter(Boolean)
      .forEach(movie => combined.set(Number(movie.id), movie));

    data.cachedMovies = [...combined.values()].slice(-250);
    saveLocal();
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  // =====================================================
  // НАВИГАЦИЯ
  // =====================================================

  function showSection(name) {
    const section = document.getElementById(name);
    if (!section) return;

    state.section = name;

    $$(".page-section").forEach(item => {
      item.classList.toggle("hidden", item.id !== name);
    });

    $$(".nav-link").forEach(button => {
      button.classList.toggle("active", button.dataset.section === name);
    });

    if (name === "records") renderRecords();
    if (name === "profile") updateProfile();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initNavigation() {
    $$("[data-section]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        showSection(button.dataset.section);
      });
    });
  }

  // =====================================================
  // ЗАПРОСЫ К TMDB
  // =====================================================

  async function apiRequest(path, params = {}) {
    if (!TMDB_API_KEY || TMDB_API_KEY === "ВСТАВЬ_НОВЫЙ_TMDB_API_KEY") {
      throw new Error("Добавь новый API-ключ TMDB в app.js.");
    }

    const query = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: "ru-RU",
      ...params
    });

    const response = await fetch(`${TMDB}${path}?${query}`);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("TMDB не принял API-ключ. Проверь настройки ключа.");
      }
      if (response.status === 429) {
        throw new Error("Слишком много запросов. Попробуй немного позже.");
      }
      throw new Error(`Ошибка TMDB: ${response.status}`);
    }

    return response.json();
  }

  async function loadGenres() {
    try {
      const result = await apiRequest("/genre/movie/list");
      state.genres = result.genres || [];

      const select = $("#genreSelect");
      if (!select) return;

      const current = select.value;
      select.innerHTML = '<option value="">Все жанры</option>';

      state.genres.forEach(genre => {
        const option = document.createElement("option");
        option.value = String(genre.id);
        option.textContent = genre.name;
        select.appendChild(option);
      });

      if ([...select.options].some(option => option.value === current)) {
        select.value = current;
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  function getFilters() {
    return {
      query: $("#searchInput")?.value.trim() || "",
      genre: $("#genreSelect")?.value || "",
      year: $("#yearSelect")?.value || "",
      sort: $("#sortSelect")?.value || "rating"
    };
  }

  async function loadMovies(reset = true) {
    if (state.loading) {
      // Запрос будет повторён после завершения предыдущего.
      state.requestId++;
      return;
    }

    const requestId = ++state.requestId;
    const filters = getFilters();

    if (reset) state.page = 1;

    state.loading = true;
    $("#catalogStatus").textContent = "Загружаем фильмы…";
    $("#loadMore").disabled = true;

    try {
      const params = {
        page: String(state.page),
        include_adult: "false"
      };

      let endpoint;

      if (filters.query) {
        endpoint = "/search/movie";
        params.query = filters.query;
      } else {
        endpoint = "/discover/movie";
        params.sort_by = filters.sort === "rating"
          ? "popularity.desc"
          : filters.sort;

        if (filters.genre) params.with_genres = filters.genre;
        if (filters.year) params.primary_release_year = filters.year;
      }

      const result = await apiRequest(endpoint, params);

      // Если пользователь успел изменить фильтры, старый результат не показываем.
      if (requestId !== state.requestId) return;

      let movies = (result.results || []).map(normalizeMovie);

      if (filters.query && filters.genre) {
        movies = movies.filter(movie =>
          (movie.genre_ids || []).includes(Number(filters.genre))
        );
      }

      if (filters.query && filters.year) {
        movies = movies.filter(movie => yearOf(movie) === filters.year);
      }

      if (filters.sort === "title.asc") {
        movies.sort((a, b) => titleOf(a).localeCompare(titleOf(b), "ru"));
      } else if (filters.sort === "vote_average.desc") {
        movies.sort((a, b) => b.vote_average - a.vote_average);
      } else if (filters.sort === "primary_release_date.desc") {
        movies.sort((a, b) => yearOf(b).localeCompare(yearOf(a)));
      } else if (filters.sort === "primary_release_date.asc") {
        movies.sort((a, b) => yearOf(a).localeCompare(yearOf(b)));
      }

      state.movies = reset ? movies : [...state.movies, ...movies];
      state.totalPages = Number(result.total_pages) || 1;

      if (state.filter !== "all") {
        renderMovies($("#movieGrid"), getFilteredMovies(state.movies));
      } else {
        renderMovies($("#movieGrid"), state.movies);
      }

      $("#catalogStatus").textContent = state.movies.length
        ? `Найдено фильмов: ${Number(result.total_results || state.movies.length).toLocaleString("ru-RU")}`
        : "По этим фильтрам фильмов не найдено.";

      $("#loadMore").classList.toggle("hidden", state.page >= state.totalPages);
      rememberMovies(state.movies);
    } catch (error) {
      if (requestId === state.requestId) {
        $("#catalogStatus").textContent = error.message;
        $("#movieGrid").innerHTML =
          `<p class="empty-state">${escapeHTML(error.message)}</p>`;
      }
    } finally {
      state.loading = false;
      $("#loadMore").disabled = false;

      // Если фильтры поменялись во время запроса — выполняем новый запрос.
      if (requestId !== state.requestId) {
        loadMovies(true);
      }
    }
  }

  function initCatalog() {
    let debounceTimer;

    $("#searchInput").addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadMovies(true), 400);
    });

    ["genreSelect", "yearSelect", "sortSelect"].forEach(id => {
      $("#" + id).addEventListener("change", () => loadMovies(true));
    });

    $("#quickFilters").addEventListener("click", event => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;

      state.filter = button.dataset.filter;
      $$("#quickFilters .chip").forEach(chip => {
        chip.classList.toggle("active", chip === button);
      });

      if (state.filter === "all") {
        renderMovies($("#movieGrid"), state.movies);
      } else {
        renderMovies($("#movieGrid"), getFilteredMovies(state.movies));
      }
    });

    $("#loadMore").addEventListener("click", async () => {
      if (state.loading || state.page >= state.totalPages) return;
      state.page++;
      await loadMovies(false);
    });
  }

  function initYears() {
    const select = $("#yearSelect");
    const currentYear = new Date().getFullYear();

    for (let year = currentYear; year >= 1950; year--) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    }
  }

  // =====================================================
  // КАРТОЧКИ ФИЛЬМОВ
  // =====================================================

  function getFilteredMovies(movies) {
    if (state.filter === "favorites") {
      return movies.filter(movie => data.favorites.includes(Number(movie.id)));
    }

    if (state.filter === "watched") {
      return movies.filter(movie => data.watched.includes(Number(movie.id)));
    }

    return movies;
  }

  function renderMovies(container, movies) {
    if (!container) return;

    if (!movies.length) {
      container.innerHTML = '<p class="empty-state">Фильмы не найдены.</p>';
      return;
    }

    container.innerHTML = movies.map(movie => {
      const id = Number(movie.id);
      const poster = imageURL(movie.poster_path);
      const favorite = data.favorites.includes(id);
      const watched = data.watched.includes(id);

      return `
        <article class="movie-card" data-movie-card="${id}">
          <div class="poster-wrap" data-open-movie="${id}" tabindex="0" role="button"
               aria-label="Подробнее: ${escapeHTML(titleOf(movie))}">
            ${poster
              ? `<img src="${poster}" alt="${escapeHTML(titleOf(movie))}" loading="lazy">`
              : '<div class="poster-placeholder">🎬</div>'}
            <span class="rating-badge">★ ${ratingOf(movie)}</span>
          </div>
          <div class="movie-card-info">
            <h3 class="movie-title" data-open-movie="${id}">${escapeHTML(titleOf(movie))}</h3>
            <div class="movie-meta">${escapeHTML(yearOf(movie))}</div>
            <div class="movie-card-actions">
              <button class="icon-button ${favorite ? "active" : ""}"
                data-action="favorite" data-id="${id}"
                aria-label="Избранное" title="Избранное">${favorite ? "♥" : "♡"}</button>
              <button class="icon-button ${watched ? "active" : ""}"
                data-action="watched" data-id="${id}"
                aria-label="Просмотрено" title="Просмотрено">${watched ? "✓" : "＋"}</button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  function initMovieActions() {
    document.addEventListener("click", event => {
      const actionButton = event.target.closest("[data-action]");
      if (actionButton) {
        const movie = findMovie(actionButton.dataset.id);
        if (!movie) return;

        toggleCollection(actionButton.dataset.action, movie);
        return;
      }

      const openButton = event.target.closest("[data-open-movie]");
      if (openButton) {
        openMovie(openButton.dataset.openMovie);
      }
    });

    document.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") &&
          event.target.matches("[data-open-movie]")) {
        event.preventDefault();
        openMovie(event.target.dataset.openMovie);
      }
    });
  }

  function toggleCollection(type, movie) {
    const id = Number(movie.id);
    const collection = type === "favorite" ? data.favorites : data.watched;
    const index = collection.indexOf(id);

    if (index >= 0) {
      collection.splice(index, 1);
      showToast(type === "favorite" ? "Удалено из избранного" : "Удалено из просмотренного");
    } else {
      collection.push(id);
      showToast(type === "favorite" ? "Добавлено в избранное ♥" : "Отмечено как просмотренное ✓");
    }

    rememberMovies([movie]);
    refreshAllCards();

    if (state.selectedMovie && Number(state.selectedMovie.id) === id) {
      openMovie(id);
    }
  }

  function refreshAllCards() {
    renderMovies($("#homeGrid"), state.homeMovies);
    renderMovies($("#movieGrid"), getFilteredMovies(state.movies));
    renderRecords();
    updateProfile();
  }

  // =====================================================
  // ИНФОРМАЦИЯ О ФИЛЬМЕ
  // =====================================================

  async function openMovie(id) {
    let movie = findMovie(id);
    if (!movie) return;

    state.selectedMovie = movie;
    const modal = $("#movieModal");
    const body = $("#modalBody");

    modal.classList.remove("hidden");
    body.innerHTML = '<p class="status-text">Загружаем информацию…</p>';

    try {
      const details = await apiRequest(`/movie/${Number(id)}`);
      movie = normalizeMovie({ ...movie, ...details });
      state.selectedMovie = movie;
      rememberMovies([movie]);
    } catch {
      // Если подробности недоступны, показываем данные карточки.
    }

    const favorite = data.favorites.includes(Number(movie.id));
    const watched = data.watched.includes(Number(movie.id));
    const poster = imageURL(movie.poster_path);
    const genres = (movie.genres || [])
      .map(genre => escapeHTML(genre.name))
      .join(", ");

    body.innerHTML = `
      <div class="modal-movie">
        <div>
          ${poster ? `<img src="${poster}" alt="${escapeHTML(titleOf(movie))}">`
            : '<div class="poster-placeholder">🎬</div>'}
        </div>
        <div>
          <span class="eyebrow">ИНФОРМАЦИЯ О ФИЛЬМЕ</span>
          <h2 id="modalTitle">${escapeHTML(titleOf(movie))}</h2>
          <p>Год: ${escapeHTML(yearOf(movie))}</p>
          <p>Рейтинг: ★ ${ratingOf(movie)}</p>
          ${genres ? `<p>Жанры: ${genres}</p>` : ""}
          ${movie.runtime ? `<p>Длительность: ${movie.runtime} мин.</p>` : ""}
          <p>${escapeHTML(movie.overview || "Описание пока недоступно.")}</p>
          <div class="modal-actions">
            <button class="button button-primary" data-action="favorite" data-id="${movie.id}">
              ${favorite ? "♥ В избранном" : "♡ В избранное"}
            </button>
            <button class="button button-outline" data-action="watched" data-id="${movie.id}">
              ${watched ? "✓ Просмотрено" : "＋ Просмотрено"}
            </button>
          </div>
        </div>
      </div>`;
  }

  function closeModal() {
    $("#movieModal").classList.add("hidden");
    state.selectedMovie = null;
  }

  function initModal() {
    $("#closeModal").addEventListener("click", closeModal);
    $$("[data-close-modal]").forEach(element =>
      element.addEventListener("click", closeModal)
    );

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeModal();
    });
  }

  // =====================================================
  // ГЛАВНАЯ
  // =====================================================

  async function loadHome() {
    try {
      const result = await apiRequest("/movie/popular", { page: "1" });
      state.homeMovies = (result.results || []).map(normalizeMovie);
      renderMovies($("#homeGrid"), state.homeMovies);
      rememberMovies(state.homeMovies);
    } catch (error) {
      $("#homeGrid").innerHTML =
        `<p class="empty-state">${escapeHTML(error.message)}</p>`;
    }
  }

  // =====================================================
  // МОИ СПИСКИ
  // =====================================================

  function initCollections() {
    $$(".collection-tabs [data-collection]").forEach(button => {
      button.addEventListener("click", () => {
        state.collection = button.dataset.collection;

        $$(".collection-tabs [data-collection]").forEach(item => {
          item.classList.toggle("active", item === button);
        });

        renderRecords();
      });
    });
  }

  function renderRecords() {
    const ids = state.collection === "favorites" ? data.favorites : data.watched;

    const movies = ids.map(id => findMovie(id)).filter(Boolean);
    renderMovies($("#recordsGrid"), movies);

    $("#recordsEmpty").classList.toggle("hidden", movies.length > 0);
    if (!movies.length) $("#recordsGrid").innerHTML = "";
  }

  // =====================================================
  // ИГРА «УГАДАЙ ФИЛЬМ»
  // =====================================================

  function initGame() {
    $("#nextQuestion").addEventListener("click", startGame);
  }

  async function startGame() {
    const button = $("#nextQuestion");
    button.disabled = true;
    button.textContent = "Загружаем…";

    try {
      let pool = state.homeMovies.filter(movie => movie.poster_path);

      if (pool.length < 4) {
        const result = await apiRequest("/movie/popular", { page: "2" });
        pool = [...pool, ...(result.results || []).map(normalizeMovie)
          .filter(movie => movie.poster_path)];
      }

      pool = [...new Map(pool.map(movie => [movie.id, movie])).values()];

      if (pool.length < 4) {
        throw new Error("Не удалось загрузить достаточно фильмов.");
      }

      state.gameMovie = pool[Math.floor(Math.random() * pool.length)];

      const others = pool.filter(movie => movie.id !== state.gameMovie.id);
      others.sort(() => Math.random() - 0.5);

      state.gameOptions = [state.gameMovie, ...others.slice(0, 3)]
        .sort(() => Math.random() - 0.5);

      state.gameAnswered = false;

      $("#gamePoster").innerHTML =
        `<img src="${imageURL(state.gameMovie.poster_path)}" alt="Постер-загадка">`;

      $("#gameQuestion").textContent = "Как называется этот фильм?";
      $("#gameFeedback").textContent = "";

      $("#gameOptions").innerHTML = state.gameOptions.map(movie => `
        <button class="game-option" data-game-id="${movie.id}">
          ${escapeHTML(titleOf(movie))}
        </button>`).join("");

      $$("#gameOptions [data-game-id]").forEach(option => {
        option.addEventListener("click", () => answerGame(option));
      });

      button.textContent = "Следующий вопрос";
    } catch (error) {
      $("#gameFeedback").textContent = error.message;
      button.textContent = "Попробовать снова";
    } finally {
      button.disabled = false;
      $("#gameScore").textContent = String(state.gameScore);
    }
  }

  function answerGame(button) {
    if (state.gameAnswered || !state.gameMovie) return;
    state.gameAnswered = true;

    const correct = Number(button.dataset.gameId) === Number(state.gameMovie.id);

    $$("#gameOptions [data-game-id]").forEach(option => {
      option.disabled = true;

      if (Number(option.dataset.gameId) === Number(state.gameMovie.id)) {
        option.classList.add("correct");
      }
    });

    if (correct) {
      state.gameScore += 1;
      data.score = state.gameScore;
      saveLocal();
      $("#gameFeedback").textContent = "Правильно! Отличное знание кино 🎉";
    } else {
      button.classList.add("wrong");
      $("#gameFeedback").textContent =
        `Не угадал! Правильный ответ: ${titleOf(state.gameMovie)}.`;
    }

    $("#gameScore").textContent = String(state.gameScore);
    $("#nextQuestion").textContent = "Следующий вопрос";
    updateProfile();
  }

  // =====================================================
  // ПРОФИЛЬ И АВТОРИЗАЦИЯ
  // =====================================================

  function updateProfile() {
    const user = state.user;
    const name = user?.name || user?.displayName || user?.login || "Киноман";
    const email = user?.email || (user ? "Вход выполнен" : "Ты используешь гостевой режим.");

    $("#profileName").textContent = name;
    $("#profileEmail").textContent = email;
    $("#profileAvatar").textContent = [...name][0]?.toUpperCase() || "К";

    $("#authStatus").textContent = user ? "Вход выполнен" : "Гостевой режим";
    $("#authButton").textContent = user ? "Аккаунт подключён" : "Войти через Яндекс";
    $("#logoutButton").classList.toggle("hidden", !user);

    $("#favoriteCount").textContent = String(data.favorites.length);
    $("#watchedCount").textContent = String(data.watched.length);
    $("#scoreCount").textContent = String(data.score);
  }

  async function checkAuth() {
    try {
      const response = await fetch(`${AUTH_URL}/me`, {
        credentials: "include"
      });

      if (!response.ok) {
        state.user = null;
        updateProfile();
        return;
      }

      const result = await response.json();
      state.user = result.user || result.profile || (result.id ? result : null);
    } catch {
      state.user = null;
    }

    updateProfile();
  }

  function initAuth() {
    $("#authButton").addEventListener("click", () => {
      if (state.user) {
        showSection("profile");
        return;
      }

      // Worker должен поддерживать маршрут /login и возвращать
      // пользователя на адрес GitHub Pages после авторизации.
      window.location.href = `${AUTH_URL}/login`;
    });

    $("#logoutButton").addEventListener("click", async () => {
      try {
        const response = await fetch(`${AUTH_URL}/logout`, {
          method: "POST",
          credentials: "include"
        });

        if (!response.ok) {
          showToast("Worker не подтвердил выход.");
          return;
        }

        state.user = null;
        updateProfile();
        showToast("Вы вышли из аккаунта.");
      } catch {
        showToast("Не удалось связаться с сервисом авторизации.");
      }
    });
  }

  // =====================================================
  // НАСТРОЙКИ
  // =====================================================

  function initSettings() {
    const toggle = $("#themeToggle");
    toggle.checked = data.settings.theme !== "light";

    document.body.classList.toggle("light", data.settings.theme === "light");

    toggle.addEventListener("change", () => {
      data.settings.theme = toggle.checked ? "dark" : "light";
      document.body.classList.toggle("light", !toggle.checked);
      saveLocal();
    });

    $("#clearLocalData").addEventListener("click", () => {
      const confirmed = window.confirm(
        "Удалить локальные избранные фильмы, просмотренное и очки? Это действие нельзя отменить."
      );

      if (!confirmed) return;

      data.favorites = [];
      data.watched = [];
      data.reviews = {};
      data.playlists = [];
      data.records = {};
      data.score = 0;

      saveLocal();
      refreshAllCards();
      showToast("Локальные данные очищены.");
    });
  }

  // =====================================================
  // ЗАПУСК
  // =====================================================

  async function init() {
    initNavigation();
    initCatalog();
    initMovieActions();
    initModal();
    initCollections();
    initGame();
    initAuth();
    initSettings();
    updateProfile();

    renderMovies($("#homeGrid"), state.homeMovies);
    renderMovies($("#movieGrid"), state.movies);

    if (!TMDB_API_KEY || TMDB_API_KEY === "ВСТАВЬ_НОВЫЙ_TMDB_API_KEY") {
      $("#catalogStatus").textContent =
        "Чтобы загрузить фильмы, настрой новый ключ TMDB в app.js.";
      $("#homeGrid").innerHTML =
        '<p class="empty-state">Добавь новый ключ TMDB, чтобы увидеть популярные фильмы.</p>';
      return;
    }

    initYears();

    await Promise.allSettled([loadGenres(), loadHome()]);
    await loadMovies(true);
    await checkAuth();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
