/* ==========================================================
   KINOPODBOR — APP.JS
   Каталог • Поиск • Профиль • Избранное • Отзывы
   Плейлисты • Игра по кадрам • Рекорды • Яндекс OAuth
   ========================================================== */

(() => {
  "use strict";

  /* ===================== CONFIG ===================== */

  const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
  const TMDB_BASE = "https://api.themoviedb.org/3";
  const TMDB_IMAGE = "https://image.tmdb.org/t/p/";
  const AUTH_URL = "https://kinopodbor-auth.2dnd99vgwk.workers.dev";
  const STORAGE_KEY = "kinopod_data_v3";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    section: "home",
    filter: "popular",
    page: 1,
    totalPages: 1,
    movies: [],
    genres: [],
    selectedMovie: null,
    game: null,
    user: null,
    loading: false
  };

  const defaultData = {
    profile: { name: "Киноман", emoji: "🍿" },
    favorites: [],
    watched: [],
    reviews: [],
    playlists: [],
    records: [],
    settings: { theme: "dark", language: "ru" }
  };

  let data = loadLocalData();
  let toastTimer;
  let searchTimer;

  /* ===================== STORAGE ===================== */

  function loadLocalData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        ...structuredClone(defaultData),
        ...saved,
        profile: { ...defaultData.profile, ...(saved.profile || {}) },
        settings: { ...defaultData.settings, ...(saved.settings || {}) },
        favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
        watched: Array.isArray(saved.watched) ? saved.watched : [],
        reviews: Array.isArray(saved.reviews) ? saved.reviews : [],
        playlists: Array.isArray(saved.playlists) ? saved.playlists : [],
        records: Array.isArray(saved.records) ? saved.records : []
      };
    } catch {
      return structuredClone(defaultData);
    }
  }

  function saveLocalData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Не удалось сохранить данные:", error);
      notify("Не удалось сохранить данные браузера");
    }
  }

  function saveAndRender() {
    saveLocalData();
    renderProfile();
    renderReviews();
    renderPlaylists();
    renderRecords();
  }

  /* ===================== HELPERS ===================== */

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function normalize(value = "") {
    return String(value)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]/gi, "");
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("ru-RU");
  }

  function movieTitle(movie) {
    return movie.title || movie.name || "Без названия";
  }

  function movieYear(movie) {
    const date = movie.release_date || movie.first_air_date || "";
    return date ? date.slice(0, 4) : "—";
  }

  function posterURL(path, size = "w500") {
    return path ? `${TMDB_IMAGE}${size}${path}` : "";
  }

  function notify(message) {
    const toast = $("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  async function api(path, params = {}) {
    if (!TMDB_API_KEY || TMDB_API_KEY.includes("ВСТАВЬ_")) {
      throw new Error("Добавь новый API-ключ TMDB в начало app.js");
    }

    const url = new URL(TMDB_BASE + path);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "ru-RU");

    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB вернул ошибку ${response.status}`);
    }
    return response.json();
  }

  function safeImage(img, path, fallback) {
    if (!img) return;

    if (!path) {
      img.hidden = true;
      if (fallback) fallback.hidden = false;
      return;
    }

    img.onerror = () => {
      img.hidden = true;
      if (fallback) fallback.hidden = false;
    };

    img.onload = () => {
      img.hidden = false;
      if (fallback) fallback.hidden = true;
    };

    img.src = path;
  }

  /* ===================== NAVIGATION ===================== */

  const sectionNames = {
    home: "Главная",
    catalog: "Каталог",
    game: "Угадай фильм",
    records: "Рекорды",
    profile: "Профиль"
  };

  function navigate(section) {
    if (!sectionNames[section]) section = "home";
    state.section = section;

    Object.keys(sectionNames).forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.toggle("page-active", id === section);
        element.hidden = id !== section;
      }
    });

    $$(".nav-link[href^='#'], .mobile-nav a").forEach(link => {
      const active = link.getAttribute("href") === `#${section}`;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if ($("#pageTitle")) {
      $("#pageTitle").textContent = sectionNames[section];
    }

    history.replaceState(null, "", `#${section}`);
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (section === "catalog" && !state.movies.length) {
      loadMovies();
    }
  }

  function initNavigation() {
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;

      const id = link.getAttribute("href").slice(1);
      if (sectionNames[id]) {
        event.preventDefault();
        navigate(id);
      }
    });

    const start = location.hash.slice(1);
    navigate(sectionNames[start] ? start : "home");
  }

  /* ===================== TMDB CATALOG ===================== */

  async function loadGenres() {
    try {
      const result = await api("/genre/movie/list");
      state.genres = result.genres || [];

      const select = $("#genreSelect");
      if (!select) return;

      select.innerHTML =
        '<option value="">Все жанры</option>' +
        state.genres.map(genre =>
          `<option value="${genre.id}">${escapeHTML(genre.name)}</option>`
        ).join("");
    } catch (error) {
      console.error(error);
    }
  }

  async function loadYears() {
    const select = $("#yearSelect");
    if (!select) return;

    const currentYear = new Date().getFullYear();
    for (let year = currentYear + 1; year >= 1900; year--) {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    }
  }

  function currentEndpoint() {
    switch (state.filter) {
      case "top": return "/movie/top_rated";
      case "now": return "/movie/now_playing";
      case "upcoming": return "/movie/upcoming";
      default: return "/movie/popular";
    }
  }

  async function loadMovies(append = false) {
    if (state.loading) return;
    state.loading = true;

    const grid = $("#movieGrid");
    const button = $("#loadMore");

    if (!append && grid) {
      grid.innerHTML = '<div class="empty-state">Загружаем фильмы…</div>';
    }
    if (button) button.disabled = true;

    try {
      const query = $("#searchInput")?.value.trim() || "";
      const genre = $("#genreSelect")?.value || "";
      const year = $("#yearSelect")?.value || "";
      const sort = $("#sortSelect")?.value || "popular";

      let endpoint = query ? "/search/movie" : currentEndpoint();

      if (!query && sort === "rating") endpoint = "/movie/top_rated";
      if (!query && sort === "newest") endpoint = "/movie/now_playing";

      const params = {
        page: state.page,
        include_adult: false
      };

      if (query) params.query = query;
      if (genre) params.with_genres = genre;
      if (year) params.primary_release_year = year;

      const result = await api(endpoint, params);
      state.totalPages = Math.min(result.total_pages || 1, 500);

      let movies = result.results || [];

      if (genre && query) {
        movies = movies.filter(movie =>
          (movie.genre_ids || []).includes(Number(genre))
        );
      }

      if (year && query) {
        movies = movies.filter(movie =>
          movieYear(movie) === year
        );
      }

      if (sort === "rating") {
        movies.sort((a, b) => b.vote_average - a.vote_average);
      } else if (sort === "newest") {
        movies.sort((a, b) =>
          (b.release_date || "").localeCompare(a.release_date || "")
        );
      }

      state.movies = append
        ? [...state.movies, ...movies]
        : movies;

      renderMovies(append);
      updateResultCount(result.total_results || movies.length);

      if (button) {
        button.hidden = state.page >= state.totalPages;
      }
    } catch (error) {
      console.error(error);
      if (grid && !append) {
        grid.innerHTML = `
          <div class="empty-state">
            <p>${escapeHTML(error.message)}</p>
            <button class="button secondary" id="retryMovies" type="button">
              Попробовать снова
            </button>
          </div>`;
      }
    } finally {
      state.loading = false;
      if (button) button.disabled = false;
    }
  }

  function updateResultCount(count) {
    const element = $("#resultCount");
    if (element) element.textContent = `Найдено: ${count.toLocaleString("ru-RU")}`;
  }

  function renderMovies(append = false) {
    const grid = $("#movieGrid");
    if (!grid) return;

    if (!state.movies.length) {
      grid.innerHTML = '<div class="empty-state">Фильмы не найдены.</div>';
      return;
    }

    const html = state.movies.map(movie => {
      const id = Number(movie.id);
      const favorite = data.favorites.some(item => Number(item.id) === id);
      const watched = data.watched.some(item => Number(item.id) === id);
      const poster = posterURL(movie.poster_path);

      return `
        <article class="movie-card" data-movie-id="${id}">
          <button class="movie-open" data-action="details" data-id="${id}"
            type="button" aria-label="Подробнее: ${escapeHTML(movieTitle(movie))}">
            <div class="movie-poster-wrap">
              ${poster
                ? `<img class="movie-poster" src="${poster}" alt="${escapeHTML(movieTitle(movie))}" loading="lazy">`
                : '<div class="poster-fallback">🎬</div>'}
              <span class="movie-rating">★ ${Number(movie.vote_average || 0).toFixed(1)}</span>
            </div>
            <div class="movie-info">
              <h3>${escapeHTML(movieTitle(movie))}</h3>
              <p>${movieYear(movie)}</p>
            </div>
          </button>
          <div class="movie-actions">
            <button class="icon-button ${favorite ? "is-active" : ""}"
              data-action="favorite" data-id="${id}" type="button"
              title="В избранное">${favorite ? "❤️" : "🤍"}</button>
            <button class="icon-button ${watched ? "is-active" : ""}"
              data-action="watched" data-id="${id}" type="button"
              title="Просмотрено">${watched ? "☑️" : "👁️"}</button>
            <button class="icon-button" data-action="add-playlist"
              data-id="${id}" type="button" title="Добавить в плейлист">➕</button>
          </div>
        </article>`;
    }).join("");

    if (append) grid.insertAdjacentHTML("beforeend", html);
    else grid.innerHTML = html;
  }

  function initCatalog() {
    $("#loadMore")?.addEventListener("click", () => {
      if (state.page < state.totalPages && !state.loading) {
        state.page++;
        loadMovies(true);
      }
    });

    ["searchInput", "genreSelect", "yearSelect", "sortSelect"].forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;

      element.addEventListener(id === "searchInput" ? "input" : "change", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.page = 1;
          loadMovies();
        }, id === "searchInput" ? 400 : 0);
      });
    });

    $("#quickFilters")?.addEventListener("click", event => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;

      state.filter = button.dataset.filter;
      $$("#quickFilters [data-filter]").forEach(item =>
        item.classList.toggle("active", item === button)
      );

      state.page = 1;
      loadMovies();
    });

    $("#retryMovies")?.addEventListener("click", () => loadMovies());
  }

  /* ===================== MOVIE DETAILS ===================== */

  async function openMovie(id) {
    try {
      const movie = await api(`/movie/${id}`, {
        append_to_response: "credits,videos"
      });

      state.selectedMovie = movie;

      const modal = $("#movieModal");
      const content = $("#modalContent");
      if (!modal || !content) return;

      const favorite = data.favorites.some(item => Number(item.id) === Number(id));
      const watched = data.watched.some(item => Number(item.id) === Number(id));
      const review = data.reviews.find(item => Number(item.movieId) === Number(id));
      const backdrop = posterURL(movie.backdrop_path, "w1280");
      const genres = (movie.genres || []).map(item => escapeHTML(item.name)).join(", ");
      const cast = (movie.credits?.cast || []).slice(0, 5)
        .map(person => escapeHTML(person.name)).join(", ");

      content.innerHTML = `
        <div class="movie-detail">
          ${backdrop
            ? `<img class="detail-backdrop" src="${backdrop}" alt="">`
            : ""}
          <h2 id="modalTitle">${escapeHTML(movieTitle(movie))}</h2>
          <p class="muted">${movieYear(movie)} · ★ ${Number(movie.vote_average || 0).toFixed(1)}</p>
          <p>${escapeHTML(genres || "Жанры не указаны")}</p>
          <p>${escapeHTML(movie.overview || "Описание отсутствует.")}</p>
          ${cast ? `<p><strong>В ролях:</strong> ${cast}</p>` : ""}
          <div class="modal-actions">
            <button class="button secondary" data-action="favorite" data-id="${id}">
              ${favorite ? "❤️ В избранном" : "🤍 В избранное"}
            </button>
            <button class="button secondary" data-action="watched" data-id="${id}">
              ${watched ? "☑️ Просмотрено" : "👁️ Отметить просмотренным"}
            </button>
          </div>
          <h3>Мой отзыв</h3>
          <form id="reviewForm" data-movie-id="${id}">
            <label>Оценка
              <select id="reviewRating">
                ${[5,4,3,2,1].map(n =>
                  `<option value="${n}" ${Number(review?.rating || 5) === n ? "selected" : ""}>${n} из 5</option>`
                ).join("")}
              </select>
            </label>
            <label>Текст отзыва
              <textarea id="reviewText" maxlength="2000"
                placeholder="Что тебе понравилось?">${escapeHTML(review?.text || "")}</textarea>
            </label>
            <button class="button primary" type="submit">Сохранить отзыв</button>
          </form>
        </div>`;

      modal.hidden = false;
      document.body.classList.add("modal-open");
    } catch (error) {
      notify(error.message || "Не удалось открыть фильм");
    }
  }

  function closeModals() {
    $$(".modal-backdrop").forEach(modal => modal.hidden = true);
    document.body.classList.remove("modal-open");
  }

  /* ===================== FAVORITES / WATCHED ===================== */

  function findMovie(id) {
    return state.movies.find(movie => Number(movie.id) === Number(id))
      || state.selectedMovie && Number(state.selectedMovie.id) === Number(id)
      ? (state.selectedMovie && Number(state.selectedMovie.id) === Number(id)
          ? state.selectedMovie
          : state.movies.find(movie => Number(movie.id) === Number(id)))
      : null;
  }

  async function getMovieSummary(id) {
    const existing = findMovie(id);
    if (existing) return existing;

    try {
      return await api(`/movie/${id}`);
    } catch {
      return { id: Number(id), title: `Фильм ${id}` };
    }
  }

  async function toggleCollection(collection, id) {
    const list = data[collection];
    const index = list.findIndex(item => Number(item.id) === Number(id));

    if (index >= 0) {
      list.splice(index, 1);
      notify(collection === "favorites" ? "Удалено из избранного" : "Убрано из просмотренных");
    } else {
      const movie = await getMovieSummary(id);
      list.push({
        id: Number(movie.id),
        title: movieTitle(movie),
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        release_date: movie.release_date || "",
        addedAt: new Date().toISOString()
      });
      notify(collection === "favorites" ? "Добавлено в избранное ❤️" : "Отмечено как просмотренное");
    }

    saveAndRender();
    renderMovies();
    if (state.selectedMovie) openMovie(id);
  }

  /* ===================== REVIEWS ===================== */

  function renderReviews() {
    const container = $("#myReviews");
    if (!container) return;

    if (!data.reviews.length) {
      container.innerHTML = '<p class="muted">Ты пока не оставил отзывов.</p>';
      return;
    }

    container.innerHTML = data.reviews.map(review => `
      <article class="review-item">
        <h4>${escapeHTML(review.title || "Фильм")}</h4>
        <p>⭐ ${Number(review.rating)}/5</p>
        <p>${escapeHTML(review.text || "")}</p>
        <small class="muted">${formatDate(review.updatedAt)}</small>
        <button class="button secondary" data-action="details"
          data-id="${Number(review.movieId)}" type="button">Открыть фильм</button>
        <button class="button secondary" data-action="delete-review"
          data-id="${Number(review.movieId)}" type="button">Удалить отзыв</button>
      </article>`).join("");
  }

  function saveReview(form) {
    const movieId = Number(form.dataset.movieId);
    const movie = state.selectedMovie;
    if (!movie || Number(movie.id) !== movieId) return;

    const rating = Number($("#reviewRating")?.value || 5);
    const text = $("#reviewText")?.value.trim() || "";
    const index = data.reviews.findIndex(item => Number(item.movieId) === movieId);

    const review = {
      movieId,
      title: movieTitle(movie),
      rating,
      text,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) data.reviews[index] = review;
    else data.reviews.push(review);

    saveAndRender();
    notify("Отзыв сохранён");
  }

  /* ===================== PLAYLISTS ===================== */

  function renderPlaylists() {
    const container = $("#playlistList");
    if (!container) return;

    if (!data.playlists.length) {
      container.innerHTML = '<p class="muted">Плейлисты появятся здесь.</p>';
      return;
    }

    container.innerHTML = data.playlists.map(playlist => `
      <article class="playlist-item panel" data-playlist-id="${escapeHTML(playlist.id)}">
        <h3>${escapeHTML(playlist.name)}</h3>
        <p class="muted">${playlist.movies.length} фильмов · ${playlist.isPublic ? "Публичный" : "Личный"}</p>
        <div class="playlist-movies">
          ${playlist.movies.slice(0, 6).map(movie => `
            <span>${escapeHTML(movie.title)}</span>`).join("")}
        </div>
        <div class="playlist-actions">
          <button class="button secondary" data-action="playlist-add-movie"
            data-id="${escapeHTML(playlist.id)}" type="button">Добавить фильм</button>
          <button class="button secondary" data-action="playlist-edit"
            data-id="${escapeHTML(playlist.id)}" type="button">Изменить</button>
          <button class="button secondary" data-action="playlist-game"
            data-id="${escapeHTML(playlist.id)}" type="button">Играть</button>
          <button class="button secondary" data-action="playlist-delete"
            data-id="${escapeHTML(playlist.id)}" type="button">Удалить</button>
        </div>
      </article>`).join("");
  }

  function createPlaylist(event) {
    event.preventDefault();
    const input = $("#playlistName");
    const name = input?.value.trim();
    if (!name) return;

    data.playlists.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      isPublic: Boolean($("#playlistPublic")?.checked),
      movies: [],
      createdAt: new Date().toISOString()
    });

    if (input) input.value = "";
    if ($("#playlistPublic")) $("#playlistPublic").checked = false;

    saveAndRender();
    notify("Плейлист создан");
  }

  async function addMovieToPlaylist(playlistId, movieId) {
    const playlist = data.playlists.find(item => item.id === playlistId);
    if (!playlist) return;

    const movie = await getMovieSummary(movieId);
    if (!playlist.movies.some(item => Number(item.id) === Number(movieId))) {
      playlist.movies.push({
        id: Number(movie.id),
        title: movieTitle(movie),
        poster_path: movie.poster_path || null,
        backdrop_path: movie.backdrop_path || null,
        release_date: movie.release_date || ""
      });
      saveAndRender();
      notify("Фильм добавлен в подборку");
    } else {
      notify("Этот фильм уже есть в подборке");
    }
  }

  function editPlaylist(id) {
    const playlist = data.playlists.find(item => item.id === id);
    if (!playlist) return;

    const name = prompt("Название плейлиста:", playlist.name);
    if (name === null) return;
    if (!name.trim()) {
      notify("Название не может быть пустым");
      return;
    }

    playlist.name = name.trim();
    playlist.isPublic = confirm("Сделать плейлист публичным? Нажми «Отмена» для личного.");
    saveAndRender();
    notify("Плейлист обновлён");
  }

  function deletePlaylist(id) {
    if (!confirm("Удалить плейлист?")) return;
    data.playlists = data.playlists.filter(item => item.id !== id);
    saveAndRender();
    notify("Плейлист удалён");
  }

  function choosePlaylistMovie(playlistId) {
    const playlist = data.playlists.find(item => item.id === playlistId);
    if (!playlist) return;

    if (!state.movies.length) {
      notify("Сначала открой каталог и загрузи фильмы");
      return;
    }

    const choices = state.movies.slice(0, 30);
    const list = choices.map((movie, index) =>
      `${index + 1}. ${movieTitle(movie)} (${movieYear(movie)})`
    ).join("\n");

    const answer = prompt(
      `Введи номер фильма из каталога для плейлиста «${playlist.name}»:\n\n${list}`
    );

    if (answer === null) return;
    const index = Number(answer) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= choices.length) {
      notify("Неверный номер фильма");
      return;
    }

    addMovieToPlaylist(playlistId, choices[index].id);
  }

  /* ===================== GAME ===================== */

  async function getGameMovies(playlistId = null, count = 5) {
    let candidates = [];

    if (playlistId) {
      const playlist = data.playlists.find(item => item.id === playlistId);
      if (playlist) candidates = playlist.movies.slice();
    }

    if (candidates.length < count) {
      try {
        const result = await api("/movie/popular", { page: 1 });
        const more = (result.results || []).filter(movie =>
          movie.backdrop_path || movie.poster_path
        );
        const seen = new Set(candidates.map(movie => Number(movie.id)));
        candidates.push(...more.filter(movie => !seen.has(Number(movie.id))));
      } catch (error) {
        console.error(error);
      }
    }

    return candidates
      .filter(movie => movie.backdrop_path || movie.poster_path)
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }

  async function startGame(playlistId = null) {
    const count = Number($("#roundCount")?.value || 5);
    const playerName = $("#playerName")?.value.trim()
      || data.profile.name
      || "Киноман";

    const startButton = $("#startGame");
    if (startButton) startButton.disabled = true;

    try {
      const movies = await getGameMovies(playlistId, count);
      if (!movies.length) {
        notify("Не удалось загрузить фильмы для игры");
        return;
      }

      state.game = {
        playerName,
        movies,
        index: 0,
        score: 0,
        hints: [],
        answered: false,
        playlistId
      };

      if ($("#gameSetup")) $("#gameSetup").hidden = true;
      if ($("#gameResults")) $("#gameResults").hidden = true;
      if ($("#gamePlay")) $("#gamePlay").hidden = false;

      showGameRound();
    } finally {
      if (startButton) startButton.disabled = false;
    }
  }

  function showGameRound() {
    const game = state.game;
    if (!game) return;

    if (game.index >= game.movies.length) {
      finishGame();
      return;
    }

    const movie = game.movies[game.index];
    game.answered = false;
    game.hints = [];

    if ($("#gameProgress")) {
      $("#gameProgress").textContent = `Раунд ${game.index + 1} из ${game.movies.length}`;
    }
    if ($("#gameScore")) $("#gameScore").textContent = `Очки: ${game.score}`;
    if ($("#gamePrompt")) $("#gamePrompt").textContent = "Угадай фильм по кадру";
    if ($("#gameFeedback")) $("#gameFeedback").textContent = "";
    if ($("#guessInput")) {
      $("#guessInput").value = "";
      $("#guessInput").disabled = false;
    }
    if ($("#submitGuess")) $("#submitGuess").disabled = false;
    if ($("#nextRound")) $("#nextRound").hidden = true;

    const image = $("#gamePoster");
    const fallback = $("#gameImageFallback");
    const imagePath = movie.backdrop_path || movie.poster_path;

    if (fallback) fallback.textContent = "Кадр загружается…";
    safeImage(image, posterURL(imagePath, "w1280"), fallback);

    if (image) image.alt = "Кадр из фильма";
    $$("#gamePlay [data-hint]").forEach(button => button.disabled = false);
  }

  function answerGame(event) {
    event.preventDefault();

    const game = state.game;
    if (!game || game.answered) return;

    const input = $("#guessInput");
    const answer = normalize(input?.value || "");
    if (!answer) return;

    const movie = game.movies[game.index];
    const correct = normalize(movieTitle(movie));

    if (answer === correct || (correct.length > 3 && correct.includes(answer) && answer.length >= 4)) {
      game.answered = true;
      game.score += Math.max(1, 100 - game.hints.length * 20);

      if ($("#gameFeedback")) {
        $("#gameFeedback").textContent = `Верно! Это «${movieTitle(movie)}» 🎉`;
      }
      if ($("#gamePrompt")) $("#gamePrompt").textContent = movieTitle(movie);
      if ($("#submitGuess")) $("#submitGuess").disabled = true;
      if (input) input.disabled = true;
      if ($("#nextRound")) $("#nextRound").hidden = false;

      if ($("#gameScore")) $("#gameScore").textContent = `Очки: ${game.score}`;
    } else {
      if ($("#gameFeedback")) {
        $("#gameFeedback").textContent = "Пока неверно. Попробуй ещё раз!";
      }
    }
  }

  async function showHint(type) {
    const game = state.game;
    if (!game || game.answered) return;

    const movie = game.movies[game.index];
    if (game.hints.includes(type)) {
      notify("Эта подсказка уже использована");
      return;
    }

    game.hints.push(type);
    let message = "";

    if (type === "year") {
      message = `Год выпуска: ${movieYear(movie)}`;
    } else if (type === "letter") {
      message = `Первая буква: ${movieTitle(movie).charAt(0)}`;
    } else if (type === "genre") {
      try {
        const details = await api(`/movie/${movie.id}`);
        const genres = (details.genres || []).map(item => item.name);
        message = `Жанр: ${genres.join(", ") || "неизвестен"}`;
      } catch {
        message = "Не удалось загрузить жанр";
      }
    }

    if ($("#gameFeedback")) $("#gameFeedback").textContent = message;
  }

  function nextRound() {
    if (!state.game) return;
    state.game.index++;
    showGameRound();
  }

  function finishGame() {
    const game = state.game;
    if (!game) return;

    if ($("#gamePlay")) $("#gamePlay").hidden = true;
    if ($("#gameResults")) $("#gameResults").hidden = false;
    if ($("#finalScore")) {
      $("#finalScore").textContent =
        `${game.playerName}, твой результат: ${game.score} очков из ${game.movies.length * 100}.`;
    }

    data.records.push({
      name: game.playerName,
      score: game.score,
      date: new Date().toISOString(),
      rounds: game.movies.length
    });

    data.records.sort((a, b) => b.score - a.score);
    data.records = data.records.slice(0, 100);
    saveAndRender();
  }

  function renderRecords() {
    const container = $("#leaderboardList");
    if (!container) return;

    if (!data.records.length) {
      container.innerHTML = '<div class="empty-state">Пока нет рекордов. Сыграй первую партию!</div>';
      return;
    }

    container.innerHTML = data.records.slice(0, 20).map((record, index) => `
      <div class="record-row">
        <span>${index + 1}</span>
        <span>${escapeHTML(record.name)}</span>
        <span>${Number(record.score)} очков</span>
      </div>`).join("");
  }

  /* ===================== PROFILE ===================== */

  function renderProfile() {
    const name = data.profile.name || "Киноман";
    const emoji = data.profile.emoji || "🍿";

    if ($("#profileName") && document.activeElement !== $("#profileName")) {
      $("#profileName").value = name;
    }
    if ($("#profileEmoji") && document.activeElement !== $("#profileEmoji")) {
      $("#profileEmoji").value = emoji;
    }

    ["miniAvatar", "topAvatar", "profileAvatar"].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = emoji;
    });

    if ($("#miniProfileName")) $("#miniProfileName").textContent = name;

    if ($("#favoriteCount")) $("#favoriteCount").textContent = data.favorites.length;
    if ($("#watchedCount")) $("#watchedCount").textContent = data.watched.length;
    if ($("#reviewCount")) $("#reviewCount").textContent = data.reviews.length;

    if ($("#authStatus")) {
      $("#authStatus").textContent = state.user ? "Вошёл через Яндекс" : "Гость";
    }
  }

  function saveProfile() {
    data.profile.name = $("#profileName")?.value.trim() || "Киноман";
    data.profile.emoji = $("#profileEmoji")?.value.trim() || "🍿";
    saveAndRender();
    notify("Профиль сохранён");
  }

  /* ===================== SETTINGS ===================== */

  function applySettings() {
    document.body.dataset.theme = data.settings.theme || "dark";

    if ($("#themeSelect")) $("#themeSelect").value = data.settings.theme || "dark";
    if ($("#languageSelect")) $("#languageSelect").value = data.settings.language || "ru";
  }

  function saveSettings() {
    data.settings.theme = $("#themeSelect")?.value || "dark";
    data.settings.language = $("#languageSelect")?.value || "ru";
    applySettings();
    saveLocalData();
    closeModals();
    notify("Настройки сохранены");
  }

  /* ===================== YANDEX AUTH ===================== */

  async function checkAuth() {
    try {
      const response = await fetch(`${AUTH_URL}/me`, {
        credentials: "include",
        headers: { "Accept": "application/json" }
      });

      if (!response.ok) return;

      const result = await response.json();
      if (!result || !(result.user || result.id || result.login)) return;

      state.user = result.user || result;

      const user = state.user;
      const name = user.display_name || user.real_name || user.name || user.login;

      if (name) {
        data.profile.name = name;
      }

      const avatar = user.default_avatar_id
        ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(user.default_avatar_id)}/islands-200`
        : user.avatar_url || user.avatar || "";

      if (avatar) {
        ["miniAvatar", "topAvatar", "profileAvatar"].forEach(id => {
          const element = document.getElementById(id);
          if (!element) return;

          if (id === "profileAvatar") {
            element.innerHTML = `<img src="${escapeHTML(avatar)}" alt="Аватар" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
          } else {
            element.innerHTML = `<img src="${escapeHTML(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`;
          }
        });
      }

      const authArea = $("#authArea");
      if (authArea) {
        authArea.innerHTML = '<span class="button secondary">Вход выполнен</span>';
      }

      if ($("#logoutBtn")) $("#logoutBtn").hidden = false;
      if ($("#welcomeTitle")) $("#welcomeTitle").textContent = `Привет, ${name || "киноман"}!`;

      saveLocalData();
      renderProfile();
    } catch (error) {
      console.warn("Проверка входа не удалась:", error);
    }
  }

  async function logout() {
    try {
      await fetch(`${AUTH_URL}/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (error) {
      console.warn(error);
    }

    state.user = null;
    location.reload();
  }

  /* ===================== EVENT DELEGATION ===================== */

  document.addEventListener("click", async event => {
    const close = event.target.closest("[data-close-modal]");
    if (close || event.target.classList.contains("modal-backdrop")) {
      closeModals();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      const id = actionButton.dataset.id;

      if (action === "details") {
        await openMovie(id);
      } else if (action === "favorite") {
        await toggleCollection("favorites", id);
      } else if (action === "watched") {
        await toggleCollection("watched", id);
      } else if (action === "delete-review") {
        data.reviews = data.reviews.filter(item => Number(item.movieId) !== Number(id));
        saveAndRender();
        notify("Отзыв удалён");
      } else if (action === "add-playlist") {
        if (!data.playlists.length) {
          notify("Сначала создай плейлист в профиле");
        } else {
          const list = data.playlists.map((item, index) =>
            `${index + 1}. ${item.name}`
          ).join("\n");
          const answer = prompt(`В какой плейлист добавить фильм?\n\n${list}`);
          if (answer !== null) {
            const index = Number(answer) - 1;
            if (index >= 0 && index < data.playlists.length) {
              await addMovieToPlaylist(data.playlists[index].id, id);
            } else {
              notify("Неверный номер плейлиста");
            }
          }
        }
      } else if (action === "playlist-edit") {
        editPlaylist(id);
      } else if (action === "playlist-delete") {
        deletePlaylist(id);
      } else if (action === "playlist-add-movie") {
        choosePlaylistMovie(id);
      } else if (action === "playlist-game") {
        await startGame(id);
        navigate("game");
      }
      return;
    }

    const hint = event.target.closest("[data-hint]");
    if (hint) {
      await showHint(hint.dataset.hint);
      return;
    }

    if (event.target.closest("#surpriseBtn")) {
      try {
        const result = await api("/movie/popular", { page: Math.ceil(Math.random() * 5) });
        if (result.results?.length) {
          const movie = result.results[Math.floor(Math.random() * result.results.length)];
          await openMovie(movie.id);
        }
      } catch (error) {
        notify(error.message);
      }
      return;
    }

    if (event.target.closest("#openSettings")) {
      if ($("#settingsModal")) $("#settingsModal").hidden = false;
      return;
    }

    if (event.target.closest("#saveSettings")) saveSettings();
    if (event.target.closest("#saveProfile")) saveProfile();
    if (event.target.closest("#logoutBtn")) logout();
    if (event.target.closest("#startGame")) startGame();
    if (event.target.closest("#playAgain")) {
      if ($("#gameResults")) $("#gameResults").hidden = true;
      if ($("#gameSetup")) $("#gameSetup").hidden = false;
    }
    if (event.target.closest("#nextRound")) nextRound();
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "reviewForm") {
      event.preventDefault();
      saveReview(event.target);
    }

    if (event.target.id === "playlistForm") {
      createPlaylist(event);
    }

    if (event.target.id === "guessForm") {
      answerGame(event);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModals();
  });

  /* ===================== INITIALIZATION ===================== */

  async function init() {
    applySettings();
    renderProfile();
    renderReviews();
    renderPlaylists();
    renderRecords();
    initNavigation();
    initCatalog();

    $("#gameSetup") && ($("#gameSetup").hidden = false);
    $("#gamePlay") && ($("#gamePlay").hidden = true);
    $("#gameResults") && ($("#gameResults").hidden = true);

    await Promise.allSettled([loadGenres(), loadYears()]);
    await loadMovies();
    await checkAuth();

    console.log("KinoPodbor запущен");
  }

  init();
})();
