
(() => {
  "use strict";

  // Получи ключ в настройках разработчика TMDB:
  // https://www.themoviedb.org/settings/api
  const TMDB_API_KEY = "2bb8c24e985622869c01b9ced2972ebe";
  const TMDB_API = "https://api.themoviedb.org/3";
  const IMAGE_BASE = "https://image.tmdb.org/t/p/";
  const STORAGE_KEY = "kinopodbor_game_collections_v1";
  const HISTORY_KEY = "kinopodbor_game_history_v1";

  const $ = (id) => document.getElementById(id);

  const state = {
    collections: [],
    editingMovies: [],
    searchResults: [],
    game: null,
    busy: false,
    toastTimer: null
  };

  const DIFFICULTY = {
    easy: { label: "Лёгкая", points: 100, hintCost: 20, hints: 3 },
    medium: { label: "Средняя", points: 200, hintCost: 50, hints: 2 },
    hard: { label: "Сложная", points: 300, hintCost: 100, hints: 1 }
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function imageURL(path, size = "w500") {
    return path ? IMAGE_BASE + size + path : "";
  }

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn("Не удалось прочитать сохранённые данные", error);
      return fallback;
    }
  }

  function saveCollections() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.collections));
      return true;
    } catch (error) {
      toast("Не удалось сохранить данные. Возможно, закончилось место.");
      return false;
    }
  }

  function newId() {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function toast(message) {
    const element = $("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove("show"), 2800);
  }

  function setStatus(id, message) {
    $(id).textContent = message;
  }

  function getCollection(id) {
    return state.collections.find(collection => collection.id === id);
  }

  function getHistory() {
    const history = readJSON(HISTORY_KEY, []);
    return Array.isArray(history) ? history : [];
  }

  async function tmdb(path, params = {}) {
    if (!TMDB_API_KEY || TMDB_API_KEY.includes("ВСТАВЬ_")) {
      throw new Error("Сначала вставь новый API-ключ TMDB в начало app.js.");
    }

    const url = new URL(TMDB_API + path);
    url.searchParams.set("api_key", TMDB_API_KEY);
    url.searchParams.set("language", "ru-RU");

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    const response = await fetch(url);
    if (!response.ok) {
      let detail = "";
      try {
        const data = await response.json();
        detail = data.status_message || "";
      } catch (_) {}
      throw new Error(detail || `TMDB вернул ошибку ${response.status}`);
    }
    return response.json();
  }

  async function searchMovies(query) {
    return tmdb("/search/movie", { query, include_adult: false, page: 1 });
  }

  async function getMovieFrames(movieId) {
    const data = await tmdb(`/movie/${movieId}/images`, {
      include_image_language: "null,en"
    });

    const unique = new Set();
    return (data.backdrops || [])
      .filter(frame => frame.file_path && !unique.has(frame.file_path) && unique.add(frame.file_path))
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .slice(0, 12);
  }

  function normaliseMovie(movie) {
    return {
      id: Number(movie.id),
      title: movie.title || movie.original_title || "Без названия",
      year: (movie.release_date || "").slice(0, 4),
      poster: movie.poster_path || "",
      overview: movie.overview || ""
    };
  }

  function renderMovieResults() {
    const root = $("movieSearchResults");
    root.replaceChildren();

    if (!state.searchResults.length) return;

    state.searchResults.forEach(movie => {
      const added = state.editingMovies.some(item => item.id === movie.id);
      const card = document.createElement("article");
      card.className = "movie-result";

      const poster = document.createElement("img");
      poster.alt = "";
      poster.loading = "lazy";
      poster.src = imageURL(movie.poster, "w185") || "";
      poster.onerror = () => { poster.style.visibility = "hidden"; };

      const info = document.createElement("div");
      info.className = "movie-result-info";

      const title = document.createElement("h4");
      title.textContent = movie.title;

      const year = document.createElement("p");
      year.textContent = movie.year || "Год неизвестен";

      const button = document.createElement("button");
      button.className = "button " + (added ? "secondary" : "primary");
      button.type = "button";
      button.textContent = added ? "Уже добавлен" : "Добавить";
      button.disabled = added;
      button.addEventListener("click", () => addMovieToEditor(movie));

      info.append(title, year, button);
      card.append(poster, info);
      root.append(card);
    });
  }

  async function runMovieSearch() {
    const query = $("movieSearch").value.trim();
    if (!query) {
      setStatus("movieSearchStatus", "Введи название фильма.");
      return;
    }

    $("movieSearchBtn").disabled = true;
    setStatus("movieSearchStatus", "Ищем фильмы…");
    $("movieSearchResults").replaceChildren();

    try {
      const data = await searchMovies(query);
      state.searchResults = (data.results || [])
        .filter(movie => movie.id && movie.title)
        .slice(0, 12)
        .map(normaliseMovie);
      renderMovieResults();
      setStatus(
        "movieSearchStatus",
        state.searchResults.length
          ? `Найдено фильмов: ${state.searchResults.length}`
          : "Ничего не найдено. Попробуй другое название."
      );
    } catch (error) {
      setStatus("movieSearchStatus", error.message);
    } finally {
      $("movieSearchBtn").disabled = false;
    }
  }

  async function addMovieToEditor(movie) {
    if (state.editingMovies.some(item => item.id === movie.id)) return;

    const entry = { ...movie, frame: "", frames: [], loading: true };
    state.editingMovies.push(entry);
    renderSelectedMovies();
    renderMovieResults();

    try {
      const frames = await getMovieFrames(movie.id);
      const current = state.editingMovies.find(item => item.id === movie.id);
      if (!current) return;

      current.frames = frames.map(frame => frame.file_path);
      current.loading = false;
      if (current.frames.length) current.frame = current.frames[0];
      renderSelectedMovies();
    } catch (error) {
      const current = state.editingMovies.find(item => item.id === movie.id);
      if (current) {
        current.loading = false;
        current.frameError = error.message;
        renderSelectedMovies();
      }
    }

    renderMovieResults();
  }

  function removeMovieFromEditor(movieId) {
    state.editingMovies = state.editingMovies.filter(movie => movie.id !== movieId);
    renderSelectedMovies();
    renderMovieResults();
  }

  function renderSelectedMovies() {
    const root = $("selectedMovies");
    root.replaceChildren();
    $("selectedMovieCount").textContent = `${state.editingMovies.length} фильмов`;

    if (!state.editingMovies.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Добавь фильмы через поиск выше.";
      root.append(empty);
      return;
    }

    state.editingMovies.forEach(movie => {
      const card = document.createElement("article");
      card.className = "selected-movie";

      const header = document.createElement("div");
      header.className = "selected-movie-heading";

      const title = document.createElement("h4");
      title.textContent = `${movie.title}${movie.year ? " (" + movie.year + ")" : ""}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button secondary movie-remove";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => removeMovieFromEditor(movie.id));
      header.append(title, remove);
      card.append(header);

      const description = document.createElement("p");
      description.className = "muted";
      description.textContent = movie.loading
        ? "Загружаем кадры…"
        : movie.frames.length
          ? "Выбери один кадр для игры:"
          : "Кадры не найдены. Попробуй другой фильм.";
      card.append(description);

      if (movie.frameError) {
        const error = document.createElement("p");
        error.className = "status";
        error.textContent = movie.frameError;
        card.append(error);
      }

      const grid = document.createElement("div");
      grid.className = "frame-grid";

      movie.frames.forEach(path => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "frame-option" + (path === movie.frame ? " selected" : "");
        button.setAttribute("aria-label", "Выбрать кадр для " + movie.title);
        button.setAttribute("aria-pressed", String(path === movie.frame));

        const image = document.createElement("img");
        image.loading = "lazy";
        image.src = imageURL(path, "w300");
        image.alt = "Кадр из фильма " + movie.title;

        button.append(image);
        button.addEventListener("click", () => {
          movie.frame = path;
          renderSelectedMovies();
        });
        grid.append(button);
      });

      card.append(grid);
      root.append(card);
    });
  }

  function resetEditor() {
    $("collectionForm").reset();
    $("collectionId").value = "";
    $("editorHeading").textContent = "Создать коллекцию";
    $("cancelEditBtn").classList.add("hidden");
    $("collectionVisibility").value = "public";
    $("defaultDifficulty").value = "medium";
    $("defaultRounds").value = "10";
    state.editingMovies = [];
    state.searchResults = [];
    $("movieSearchResults").replaceChildren();
    setStatus("movieSearchStatus", "");
    setStatus("editorStatus", "");
    renderSelectedMovies();
    renderMovieResults();
  }

  function editCollection(id) {
    const collection = getCollection(id);
    if (!collection) return;

    $("collectionId").value = collection.id;
    $("collectionName").value = collection.name;
    $("collectionDescription").value = collection.description || "";
    $("collectionVisibility").value = collection.visibility;
    $("defaultDifficulty").value = collection.difficulty || "medium";
    $("defaultRounds").value = String(collection.rounds || 10);
    $("editorHeading").textContent = "Редактировать коллекцию";
    $("cancelEditBtn").classList.remove("hidden");

    state.editingMovies = collection.movies.map(movie => ({
      ...movie,
      frames: movie.frames || [movie.frame].filter(Boolean),
      loading: false
    }));

    renderSelectedMovies();
    $("editor").scrollIntoView({ behavior: "smooth" });
  }

  function renderCollections() {
    const root = $("collectionList");
    root.replaceChildren();

    const query = $("collectionSearch").value.trim().toLowerCase();
    const filter = $("collectionFilter").value;

    const visible = state.collections.filter(collection => {
      const matchesText = `${collection.name} ${collection.description || ""}`
        .toLowerCase().includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "mine") ||
        (filter === "public" && collection.visibility === "public");
      return matchesText && matchesFilter;
    });

    $("collectionEmpty").classList.toggle("hidden", visible.length > 0);

    visible.forEach(collection => {
      const card = document.createElement("article");
      card.className = "collection-card";

      const cover = document.createElement("div");
      cover.className = "collection-cover";
      const first = collection.movies.find(movie => movie.frame);

      if (first) {
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = imageURL(first.frame, "w500");
        img.alt = "Кадр коллекции " + collection.name;
        cover.append(img);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "placeholder";
        placeholder.textContent = "🎬";
        cover.append(placeholder);
      }

      const body = document.createElement("div");
      body.className = "collection-card-body";

      const title = document.createElement("h3");
      title.textContent = collection.name;

      const description = document.createElement("p");
      description.textContent = collection.description || "Без описания";

      const pills = document.createElement("div");
      pills.className = "pills";
      [
        collection.visibility === "public" ? "Публичная" : "Личная",
        `${collection.movies.length} фильмов`,
        DIFFICULTY[collection.difficulty]?.label || "Средняя",
        `${collection.rounds || 10} раундов`
      ].forEach(label => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = label;
        pills.append(pill);
      });

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const play = document.createElement("button");
      play.type = "button";
      play.className = "button primary";
      play.textContent = "Играть";
      play.disabled = !collection.movies.some(movie => movie.frame);
      play.addEventListener("click", () => {
        $("gameCollection").value = collection.id;
        $("gameDifficulty").value = collection.difficulty || "medium";
        $("gameRounds").value = String(collection.rounds || 10);
        $("gameResults").classList.add("hidden");
        $("gamePlay").classList.add("hidden");
        $("gameSetup").classList.remove("hidden");
        $("game").scrollIntoView({ behavior: "smooth" });
      });

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "button secondary";
      edit.textContent = "Изменить";
      edit.addEventListener("click", () => editCollection(collection.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button secondary";
      remove.textContent = "Удалить";
      remove.addEventListener("click", () => {
        if (!confirm(`Удалить коллекцию «${collection.name}»?`)) return;
        state.collections = state.collections.filter(item => item.id !== collection.id);
        saveCollections();
        renderCollections();
        renderGameCollectionOptions();
        toast("Коллекция удалена");
      });

      actions.append(play, edit, remove);
      body.append(title, description, pills, actions);
      card.append(cover, body);
      root.append(card);
    });

    renderGameCollectionOptions();
  }

  function renderGameCollectionOptions() {
    const select = $("gameCollection");
    const previous = select.value;
    select.replaceChildren();

    const usable = state.collections.filter(collection =>
      collection.movies.some(movie => movie.frame)
    );

    if (!usable.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Сначала создай коллекцию с кадрами";
      select.append(option);
      $("startGameBtn").disabled = true;
      return;
    }

    usable.forEach(collection => {
      const option = document.createElement("option");
      option.value = collection.id;
      option.textContent = `${collection.name} (${collection.movies.length})`;
      select.append(option);
    });

    if (usable.some(collection => collection.id === previous)) {
      select.value = previous;
    }

    $("startGameBtn").disabled = false;
  }

  function handleSaveCollection(event) {
    event.preventDefault();

    const name = $("collectionName").value.trim();
    if (!name) {
      setStatus("editorStatus", "Укажи название коллекции.");
      return;
    }

    const movies = state.editingMovies
      .filter(movie => movie.frame)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        year: movie.year,
        poster: movie.poster,
        overview: movie.overview,
        frame: movie.frame,
        frames: movie.frames
      }));

    if (!movies.length) {
      setStatus("editorStatus", "Добавь хотя бы один фильм и выбери кадр.");
      return;
    }

    const existingId = $("collectionId").value;
    const existing = existingId ? getCollection(existingId) : null;

    const collection = {
      id: existingId || newId(),
      name,
      description: $("collectionDescription").value.trim(),
      visibility: $("collectionVisibility").value,
      difficulty: $("defaultDifficulty").value,
      rounds: Number($("defaultRounds").value),
      movies,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existing) {
      state.collections = state.collections.map(item =>
        item.id === existingId ? collection : item
      );
    } else {
      state.collections.unshift(collection);
    }

    if (!saveCollections()) return;

    renderCollections();
    resetEditor();
    toast("Коллекция сохранена");
    $("collections").scrollIntoView({ behavior: "smooth" });
  }

  function shuffle(items) {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function startGame() {
    const collection = getCollection($("gameCollection").value);
    if (!collection) {
      setStatus("gameSetupStatus", "Выбери коллекцию.");
      return;
    }

    const movies = collection.movies.filter(movie => movie.frame);
    if (!movies.length) {
      setStatus("gameSetupStatus", "В этой коллекции нет выбранных кадров.");
      return;
    }

    const difficulty = $("gameDifficulty").value;
    const rounds = Number($("gameRounds").value);

    // Все вопросы строятся исключительно по фильмам выбранной коллекции.
    const questions = Array.from({ length: rounds }, (_, index) => {
      const movie = movies[index % movies.length];
      return { movie, revealedHint: 0, answered: false, skipped: false };
    });

    state.game = {
      collectionId: collection.id,
      collectionName: collection.name,
      difficulty,
      rounds,
      questions: shuffle(questions),
      index: 0,
      score: 0,
      correct: 0,
      finished: false
    };

    $("gameSetup").classList.add("hidden");
    $("gameResults").classList.add("hidden");
    $("gamePlay").classList.remove("hidden");
    showRound();
  }

  function buildOptions(question) {
    const collection = getCollection(state.game.collectionId);
    const allMovies = collection.movies.filter(movie => movie.frame);
    const distractors = shuffle(allMovies.filter(movie => movie.id !== question.movie.id))
      .slice(0, 3);

    return shuffle([question.movie, ...distractors]);
  }

  function showRound() {
    const game = state.game;
    if (!game || game.finished) return;

    const question = game.questions[game.index];
    const difficulty = DIFFICULTY[game.difficulty];

    $("roundLabel").textContent = `Раунд ${game.index + 1} / ${game.rounds}`;
    $("scoreLabel").textContent = `Очки: ${game.score}`;
    $("gameProgress").style.width = `${(game.index / game.rounds) * 100}%`;
    $("gameFrame").replaceChildren();

    const image = document.createElement("img");
    image.alt = "Кадр для угадывания фильма";
    image.src = imageURL(question.movie.frame, "w1280");
    image.onerror = () => {
      $("gameFrame").textContent = "Не удалось загрузить кадр.";
    };
    $("gameFrame").append(image);

    $("hintArea").classList.add("hidden");
    $("hintArea").textContent = "";
    $("hintBtn").disabled = false;
    $("hintBtn").textContent = `Показать подсказку (${difficulty.hints})`;
    $("answerFeedback").textContent = "";
    $("answerFeedback").className = "feedback";
    $("nextRoundBtn").classList.add("hidden");
    $("skipBtn").classList.remove("hidden");

    const options = buildOptions(question);
    const root = $("answerOptions");
    root.replaceChildren();

    options.forEach(movie => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "answer-option";
      button.textContent = movie.title + (movie.year ? ` (${movie.year})` : "");
      button.addEventListener("click", () => answerQuestion(movie.id, button));
      root.append(button);
    });
  }

  function revealHint() {
    const game = state.game;
    if (!game || game.finished) return;

    const question = game.questions[game.index];
    if (question.answered || question.skipped) return;

    const config = DIFFICULTY[game.difficulty];
    if (question.revealedHint >= config.hints) {
      $("hintBtn").disabled = true;
      return;
    }

    question.revealedHint++;

    let hint = "";
    if (question.revealedHint === 1) {
      hint = question.movie.year
        ? `Год выхода: ${question.movie.year}.`
        : "Год выхода неизвестен.";
    } else if (question.revealedHint === 2) {
      const title = question.movie.title;
      hint = `Название начинается на «${Array.from(title)[0]}».`;
    } else {
      hint = `Оригинальное описание: ${question.movie.overview || "Описание отсутствует."}`;
    }

    $("hintArea").classList.remove("hidden");
    $("hintArea").textContent += (question.revealedHint > 1 ? "\n" : "") + hint;
    $("hintArea").style.whiteSpace = "pre-line";
    $("hintBtn").textContent = question.revealedHint < config.hints
      ? `Ещё подсказка (${config.hints - question.revealedHint})`
      : "Все подсказки использованы";

    if (question.revealedHint >= config.hints) {
      $("hintBtn").disabled = true;
    }
  }

  function answerQuestion(movieId, chosenButton) {
    const game = state.game;
    if (!game || game.finished) return;

    const question = game.questions[game.index];
    if (question.answered || question.skipped) return;

    question.answered = true;
    const correct = Number(movieId) === Number(question.movie.id);
    const config = DIFFICULTY[game.difficulty];

    $("answerOptions").querySelectorAll("button").forEach(button => {
      button.disabled = true;
    });

    if (correct) {
      const points = Math.max(0, config.points - question.revealedHint * config.hintCost);
      game.score += points;
      game.correct++;
      chosenButton.classList.add("correct");
      $("answerFeedback").textContent = `Верно! +${points} очков`;
      $("answerFeedback").classList.add("success");
    } else {
      chosenButton.classList.add("incorrect");
      $("answerOptions").querySelectorAll("button").forEach(button => {
        if (button.textContent.startsWith(question.movie.title)) {
          button.classList.add("correct");
        }
      });
      $("answerFeedback").textContent = `Неверно. Правильный ответ: ${question.movie.title}`;
      $("answerFeedback").classList.add("error");
    }

    $("scoreLabel").textContent = `Очки: ${game.score}`;
    $("hintBtn").disabled = true;
    $("skipBtn").classList.add("hidden");
    $("nextRoundBtn").textContent =
      game.index + 1 >= game.rounds ? "Показать результат" : "Следующий раунд";
    $("nextRoundBtn").classList.remove("hidden");
  }

  function skipQuestion() {
    const game = state.game;
    if (!game || game.finished) return;

    const question = game.questions[game.index];
    if (question.answered || question.skipped) return;

    question.skipped = true;
    $("answerOptions").querySelectorAll("button").forEach(button => {
      button.disabled = true;
      if (button.textContent.startsWith(question.movie.title)) {
        button.classList.add("correct");
      }
    });

    $("answerFeedback").textContent =
      `Раунд пропущен: 0 очков. Ответ: ${question.movie.title}`;
    $("answerFeedback").classList.add("error");
    $("hintBtn").disabled = true;
    $("skipBtn").classList.add("hidden");
    $("nextRoundBtn").textContent =
      game.index + 1 >= game.rounds ? "Показать результат" : "Следующий раунд";
    $("nextRoundBtn").classList.remove("hidden");
  }

  function nextRound() {
    if (!state.game || state.game.finished) return;

    if (state.game.index + 1 >= state.game.rounds) {
      finishGame();
      return;
    }

    state.game.index++;
    showRound();
  }

  function finishGame() {
    const game = state.game;
    if (!game || game.finished) return;
    game.finished = true;

    const history = getHistory();
    const previousBest = history
      .filter(item => item.collectionId === game.collectionId)
      .reduce((best, item) => Math.max(best, Number(item.score) || 0), 0);

    const entry = {
      id: newId(),
      collectionId: game.collectionId,
      collectionName: game.collectionName,
      difficulty: game.difficulty,
      rounds: game.rounds,
      score: game.score,
      correct: game.correct,
      accuracy: Math.round((game.correct / game.rounds) * 100),
      date: new Date().toISOString()
    };

    history.unshift(entry);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
    } catch (error) {
      console.warn("Не удалось сохранить историю игры", error);
    }

    const best = Math.max(previousBest, game.score);
    $("gameProgress").style.width = "100%";
    $("gamePlay").classList.add("hidden");
    $("gameResults").classList.remove("hidden");
    $("finalScore").textContent = String(game.score);
    $("resultSummary").textContent =
      `Коллекция «${game.collectionName}». Сложность: ${DIFFICULTY[game.difficulty].label}. Раундов: ${game.rounds}.`;
    $("correctCount").textContent = `${game.correct} / ${game.rounds}`;
    $("accuracyCount").textContent = `${entry.accuracy}%`;
    $("bestScore").textContent = String(best);

    renderHistory();
  }

  function renderHistory() {
    const root = $("gameHistory");
    root.replaceChildren();
    const history = getHistory().slice(0, 10);

    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Пока нет завершённых игр.";
      root.append(empty);
      return;
    }

    history.forEach(entry => {
      const row = document.createElement("div");
      row.className = "history-row";

      const left = document.createElement("span");
      left.textContent = `${entry.collectionName} · ${entry.correct}/${entry.rounds}`;

      const right = document.createElement("strong");
      right.textContent = `${entry.score} очков`;

      row.append(left, right);
      root.append(row);
    });
  }

  function init() {
    const stored = readJSON(STORAGE_KEY, []);
    state.collections = Array.isArray(stored) ? stored : [];

    $("collectionForm").addEventListener("submit", handleSaveCollection);
    $("movieSearchBtn").addEventListener("click", runMovieSearch);
    $("movieSearch").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        runMovieSearch();
      }
    });

    $("collectionSearch").addEventListener("input", renderCollections);
    $("collectionFilter").addEventListener("change", renderCollections);

    $("newCollectionBtn").addEventListener("click", () => {
      resetEditor();
      $("editor").scrollIntoView({ behavior: "smooth" });
      $("collectionName").focus({ preventScroll: true });
    });

    $("cancelEditBtn").addEventListener("click", resetEditor);
    $("startGameBtn").addEventListener("click", startGame);
    $("hintBtn").addEventListener("click", revealHint);
    $("skipBtn").addEventListener("click", skipQuestion);
    $("nextRoundBtn").addEventListener("click", nextRound);

    $("playAgainBtn").addEventListener("click", () => {
      $("gameResults").classList.add("hidden");
      $("gameSetup").classList.remove("hidden");
      startGame();
    });

    $("backToSetupBtn").addEventListener("click", () => {
      $("gameResults").classList.add("hidden");
      $("gameSetup").classList.remove("hidden");
    });

    renderSelectedMovies();
    renderCollections();
    renderHistory();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
