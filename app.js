(() => {
  "use strict";

  const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
  const TMDB_BASE = "https://themoviedb.org";
  const TMDB_IMAGE = "https://tmdb.org";
  const STORAGE_KEY = "kinopod_data_v3";
  const AUTH_URL = "https://workers.dev"; [1]

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const state = {
    section: "home", filter: "popular", page: 1,
    movies: [], loading: false,
    currentGame: { correctMovie: null, options: [] }
  };

  const defaultData = {
    profile: { name: "Гость", emoji: "🎭", isYandex: false, avatarUrl: "" },
    score: 0, theme: "dark"
  };

  let data = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultData, ...JSON.parse(saved) } : structuredClone(defaultData);
    } catch { return structuredClone(defaultData); }
  })();

  function saveData() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.error(e); }
  }

  function showToast(msg) {
    const t = $("#toast"); if (!t) return;
    t.textContent = msg; t.style.display = "block";
    setTimeout(() => t.style.display = "none", 3000);
  }

  function escapeHTML(str = "") {
    return String(str).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  }

  async function fetchAPI(path, params = {}) {
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "ru-RU");
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
    const res = await fetch(url);
    if (!res.ok) throw new Error("API Error");
    return res.json();
  }

  function navigate(section) {
    state.section = section;
    $$(".page-section").forEach(el => {
      if (el.id === section) { el.classList.add("page-active"); el.removeAttribute("hidden"); }
      else { el.classList.remove("page-active"); el.setAttribute("hidden", "true"); }
    });
    $$(".nav-link").forEach(l => l.classList.toggle("active", l.getAttribute("href") === `#${section}`));
    $("#currentPageName").textContent = section === "home" ? "Главная" : section.toUpperCase();
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (section === "catalog" && !state.movies.length) loadCatalog();
  }

  async function loadGenres() {
    try {
      const res = await fetchAPI("/genre/movie/list");
      if ($("#genreSelect")) {
        $("#genreSelect").innerHTML = '<option value="">Все жанры</option>' + 
          res.genres.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("");
      }
    } catch (e) { console.error(e); }
  }

  async function loadCatalog(append = false) {
    if (state.loading) return; state.loading = true;
    const grid = $("#movieGrid");
    if (!append) grid.innerHTML = '<div class="loading-state">Загрузка каталога...</div>';

    try {
      const query = $("#searchInput")?.value.trim() || "";
      const genre = $("#genreSelect")?.value || "";
      let endpoint = query ? "/search/movie" : "/movie/popular";
      if (!query && state.filter === "top") endpoint = "/movie/top_rated";
      if (!query && state.filter === "now") endpoint = "/movie/now_playing";
      if (!query && state.filter === "upcoming") endpoint = "/movie/upcoming";

      const params = { page: state.page, query: query || undefined, with_genres: genre || undefined };
      const res = await fetchAPI(endpoint, params);
      
      if (!append) state.movies = [];
      state.movies = [...state.movies, ...res.results];
      renderMovies(grid, res.results, append);
    } catch (e) { grid.innerHTML = '<div>Не удалось загрузить фильмы.</div>'; }
    finally { state.loading = false; }
  }

  async function loadHomeMovies() {
    const grid = $("#homeMovieGrid"); if (!grid) return;
    try {
      const res = await fetchAPI("/movie/popular", { page: 1 });
      renderMovies(grid, res.results.slice(0, 8), false);
    } catch (e) { grid.innerHTML = '<div>Ошибка загрузки трендов.</div>'; }
  }

  function renderMovies(container, items, append) {
    const html = items.map(m => `
      <article class="movie-card" data-id="${m.id}">
        <div class="movie-poster-wrap">
          <img src="${m.poster_path ? TMDB_IMAGE + "w500" + m.poster_path : 'https://placeholder.com'}" alt="Постер" loading="lazy">
          <span class="movie-rating-badge">★ ${m.vote_average ? m.vote_average.toFixed(1) : "0.0"}</span>
        </div>
        <div class="movie-card-info">
          <h3 class="movie-card-title">${escapeHTML(m.title)}</h3>
        </div>
      </article>
    `).join("");
    if (append) container.insertAdjacentHTML("beforeend", html); else container.innerHTML = html;
  }

  async function showMovieModal(id) {
    try {
      const m = await fetchAPI(`/movie/${id}`);
      $("#modalPoster").src = m.poster_path ? TMDB_IMAGE + "w500" + m.poster_path : 'https://placeholder.com';
      $("#modalTitle").textContent = m.title;
      $("#modalYear").textContent = m.release_date ? m.release_date.slice(0, 4) : "—";
      $("#modalRating").textContent = `★ ${m.vote_average ? m.vote_average.toFixed(1) : "0.0"}`;
      $("#modalOverview").textContent = m.overview || "Описание фильма отсутствует на русском языке.";
      $("#movieModal").removeAttribute("hidden");
    } catch (e) { console.error(e); }
  }

  async function setupGameRound() {
    $("#gameStartWindow").style.display = "none";
    $("#gamePlayWindow").style.display = "block";
    $("#gameNextBtn").style.display = "none";
    $("#gameFrameBlock").classList.remove("guessed");
    $("#gameScoreValue").textContent = data.score;

    try {
      const randomPage = Math.floor(Math.random() * 5) + 1;
      const res = await fetchAPI("/movie/popular", { page: randomPage });
      const list = res.results.filter(m => m.poster_path && m.title);
      
      const correct = list[Math.floor(Math.random() * list.length)];
      state.currentGame.correctMovie = correct;

      let options = [correct];
      while (options.length < 4) {
        let fake = list[Math.floor(Math.random() * list.length)];
        if (!options.some(o => o.id === fake.id)) options.push(fake);
      }
      options.sort(() => Math.random() - 0.5);
      state.currentGame.options = options;

      const img = $("#gameFrameImg");
      img.src = TMDB_IMAGE + "w500" + correct.poster_path;
      
      $("#gameOptionsGrid").innerHTML = options.map(o => `
        <button class="button game-opt-btn" data-id="${o.id}">${escapeHTML(o.title)}</button>
      `).join("");
    } catch (e) { console.error(e); showToast("Не удалось загрузить раунд"); }
  }

  function applyTheme(themeName) {
    document.documentElement.setAttribute("data-theme", themeName);
    data.theme = themeName; saveData();
  }

  function renderProfile() {
    const isYandex = data.profile.isYandex;
    $("#miniProfileName").textContent = data.profile.name;
    $("#profileName").textContent = data.profile.name;
    $("#authStatus").textContent = isYandex ? "Яндекс ID" : "Локальный профиль";
    $("#profileStatusLabel").textContent = isYandex ? "Авторизован через Яндекс" : "Локальный профиль";

    const avatarHTML = (isYandex && data.profile.avatarUrl) 
      ? `<img src="${data.profile.avatarUrl}" alt="Ava">` 
      : data.profile.emoji;

    $("#miniAvatar").innerHTML = avatarHTML;
    $("#profileAvatar").innerHTML = avatarHTML;
    
    if (isYandex) {
      $("#loginBtn").style.display = "none";
      $("#logoutBtn").style.display = "inline-flex";
    } else {
      $("#loginBtn").style.display = "block";
      $("#logoutBtn").style.display = "none";
    }
  }

  function handleYandexAuth() {
    window.location.href = `${AUTH_URL}/login`; [1]
  }

  async function checkAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    
    if (token || window.location.hash.includes("token")) {
      try {
        const res = await fetch(`${AUTH_URL}/me`, { headers: { "Authorization": `Bearer ${token}` } }); [1]
        if (res.ok) {
          const userData = await res.json();
          data.profile = {
            name: userData.display_name || userData.first_name,
            emoji: "🎭",
            isYandex: true,
            avatarUrl: userData.avatar_url || "" 
          };
          saveData(); renderProfile();
          showToast("Успешный вход через Яндекс!");
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) { console.error("Ошибка OAuth", e); }
    }
  }

  function init() {
    applyTheme(data.theme);

    document.addEventListener("click", e => {
      const link = e.target.closest('a[href^="#"]');
      if (link) { e.preventDefault(); navigate(link.getAttribute("href").slice(1)); return; }

      const card = e.target.closest(".movie-card");
      if (card) { showMovieModal(card.dataset.id); return; }

      if (e.target.closest(".mood-card")) {
        const moodGenre = e.target.closest(".mood-card").dataset.mood;
        navigate("catalog");
        if ($("#genreSelect")) { $("#genreSelect").value = moodGenre; loadCatalog(false); }
        return;
      }

      if (e.target.classList.contains("game-opt-btn")) {
        const btn = e.target;
        const selectedId = parseInt(btn.dataset.id);
        const correctId = state.currentGame.correctMovie.id;
        
        $$(".game-opt-btn").forEach(b => b.disabled = true);
        $("#gameFrameBlock").classList.add("guessed");

        if (selectedId === correctId) {
          btn.classList.add("correct"); data.score += 10; saveData();
          $("#gameScoreValue").textContent = data.score;
        } else {
