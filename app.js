(() => {
  "use strict";

  const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
  const TMDB_BASE = "https://themoviedb.org";
  const TMDB_IMAGE = "https://tmdb.org";
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
    loading: false
  };

  const defaultData = {
    profile: { name: "Киноман", emoji: "🍿" },
    favorites: [], reviews: [], playlists: [], records: []
  };

  let data = loadLocalData();

  function loadLocalData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return { ...defaultData, ...saved };
    } catch {
      return structuredClone(defaultData);
    }
  }

  function saveAndRender() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.error(e); }
    renderProfile();
  }

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function movieTitle(m) { return m.title || m.name || "Без названия"; }
  function movieYear(m) { return m.release_date ? m.release_date.slice(0, 4) : "—"; }
  function posterURL(path) { return path ? `${TMDB_IMAGE}w500${path}` : ""; }

  async function api(path, params = {}) {
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "ru-RU");
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v));
    const res = await fetch(url);
    if (!res.ok) throw new Error("Ошибка API");
    return res.json();
  }

  function navigate(section) {
    state.section = section;
    $$(".page-section").forEach(el => {
      const isCurrent = el.id === section;
      el.classList.toggle("page-active", isCurrent);
      if (isCurrent) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "true");
    });

    $$(".nav-link").forEach(link => {
      link.classList.toggle("active", link.getAttribute("href") === `#${section}`);
    });

    if ($("#currentPageName")) {
      $("#currentPageName").textContent = section === "home" ? "Главная" : section.toUpperCase();
    }

    if (section === "catalog" && !state.movies.length) {
      loadMovies();
    }
  }

  async function loadGenres() {
    try {
      const res = await api("/genre/movie/list");
      const select = $("#genreSelect");
      if (select) {
        select.innerHTML = '<option value="">Все жанры</option>' + 
          res.genres.map(g => `<option value="${g.id}">${escapeHTML(g.name)}</option>`).join("");
      }
    } catch (e) { console.error(e); }
  }

  function currentEndpoint() {
    if (state.filter === "top") return "/movie/top_rated";
    if (state.filter === "now") return "/movie/now_playing";
    if (state.filter === "upcoming") return "/movie/upcoming";
    return "/movie/popular";
  }

  async function loadMovies(append = false) {
    if (state.loading) return;
    state.loading = true;

    const grid = $("#movieGrid") || $("#homeMovieGrid");
    if (!append && grid) grid.innerHTML = '<div>Загрузка...</div>';

    try {
      const query = $("#searchInput")?.value.trim() || "";
      const genre = $("#genreSelect")?.value || "";
      const sort = $("#sortSelect")?.value || "popular";

      let endpoint = query ? "/search/movie" : currentEndpoint();
      if (!query && sort === "rating") endpoint = "/movie/top_rated";

      const params = { page: state.page, query: query || undefined, with_genres: genre || undefined };
      const result = await api(endpoint, params);

      state.movies = append ? [...state.movies, ...result.results] : result.results;
      
      if (grid) {
        const html = result.results.map(m => `
          <article class="movie-card">
            <img src="${posterURL(m.poster_path) || 'https://placeholder.com'}" alt="${escapeHTML(movieTitle(m))}">
            <div style="padding:12px;">
              <h3>${escapeHTML(movieTitle(m))}</h3>
              <p>${movieYear(m)}</p>
            </div>
          </article>
        `).join("");
        
        if (append) grid.insertAdjacentHTML("beforeend", html);
        else grid.innerHTML = html;
      }
    } catch (e) {
      if (grid) grid.innerHTML = '<div>Ошибка загрузки данных.</div>';
    } finally {
      state.loading = false;
    }
  }

  function renderProfile() {
    if ($("#profileName")) $("#profileName").textContent = data.profile.name;
    if ($("#profileAvatar")) $("#profileAvatar").textContent = data.profile.emoji;
    if ($("#miniProfileName")) $("#miniProfileName").textContent = data.profile.name;
    if ($("#miniAvatar")) $("#miniAvatar").textContent = data.profile.emoji;
  }

  function init() {
    document.addEventListener("click", e => {
      const link = e.target.closest('a[href^="#"]');
      if (link) {
        e.preventDefault();
        navigate(link.getAttribute("href").slice(1));
      }
    });

    loadGenres();
    saveAndRender();
    loadMovies();

    $("#searchInput")?.addEventListener("input", () => {
      state.page = 1;
      loadMovies();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
