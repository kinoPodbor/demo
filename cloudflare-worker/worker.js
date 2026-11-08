const API = "https://api.kinopoisk.dev/v1.4";
const GENRES = [
  {id:28,name:"боевик"},{id:12,name:"приключения"},{id:16,name:"мультфильм"},{id:35,name:"комедия"},
  {id:80,name:"криминал"},{id:99,name:"документальный"},{id:18,name:"драма"},{id:10751,name:"семейный"},
  {id:14,name:"фэнтези"},{id:36,name:"история"},{id:27,name:"ужасы"},{id:10402,name:"музыка"},
  {id:9648,name:"детектив"},{id:10749,name:"мелодрама"},{id:878,name:"фантастика"},
  {id:53,name:"триллер"},{id:10752,name:"военный"},{id:37,name:"вестерн"}
];
const idByGenre = Object.fromEntries(GENRES.map(g=>[g.name,g.id]));
const genreById = Object.fromEntries(GENRES.map(g=>[String(g.id),g.name]));
const cors = origin => ({"Access-Control-Allow-Origin":origin||"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Access-Control-Max-Age":"86400"});
function reply(data,status,origin){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors(origin)}})}
function mapMovie(m){
  const genres=(m.genres||[]).map(g=>idByGenre[String(g.name||"").toLowerCase()]).filter(Boolean);
  const date=m.premiere?.world||m.premiere?.russia||(m.year?`${m.year}-01-01`:"");
  return {id:m.id,title:m.name||m.alternativeName||"Без названия",release_date:date,vote_average:Number(m.rating?.kp||m.rating?.imdb||0),overview:m.description||m.shortDescription||"",poster_path:m.poster?.url||"",backdrop_path:m.backdrop?.url||"",genre_ids:genres};
}
export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get("Origin")||"*";
  if(request.method==="OPTIONS")return new Response(null,{headers:cors(origin)});
  if(request.method!=="GET")return reply({error:"Method not allowed"},405,origin);
  if(!env.KINOPOISK_TOKEN)return reply({error:"Secret KINOPOISK_TOKEN is not configured"},500,origin);
  if(url.pathname.endsWith("/genre/movie/list"))return reply({genres:GENRES.map(g=>({id:g.id,name:g.name[0].toUpperCase()+g.name.slice(1)}))},200,origin);
  if(url.pathname.endsWith("/game/movies")){
    const count=Math.min(20,Math.max(5,Number(url.searchParams.get("count")||10)));
    const kind=url.searchParams.get("kind")||"mixed",difficulty=url.searchParams.get("difficulty")||"medium";
    const movieParams=new URLSearchParams({page:"1",limit:String(Math.min(100,count*5)),sortField:"votes.kp",sortType:"-1",notNullFields:"name", "rating.kp":difficulty==="easy"?"7-10":difficulty==="hard"?"1-10":"5-10"});
    for(const f of ["id","name","alternativeName","year","genres","type","poster","backdrop","rating","votes"])movieParams.append("selectFields",f);
    if(kind==="movie")movieParams.append("type","movie");
    else if(kind==="cartoon")movieParams.append("type","cartoon");
    else {movieParams.append("type","movie");movieParams.append("type","cartoon");}
    const movieResponse=await fetch(`${API}/movie?${movieParams}`,{headers:{"X-API-KEY":env.KINOPOISK_TOKEN,"Accept":"application/json"}});
    const movieBody=await movieResponse.json().catch(()=>({}));
    if(!movieResponse.ok)return reply({error:"Kinopoisk movie query failed",upstreamStatus:movieResponse.status,details:movieBody},movieResponse.status,origin);
    const docs=(movieBody.docs||movieBody.items||[]).filter(m=>m.name&&m.id);
    const imageParams=new URLSearchParams({page:"1",limit:"250",type:"screenshot"});
    for(const m of docs)imageParams.append("movieId",String(m.id));
    for(const f of ["url","movieId","type"])imageParams.append("selectFields",f);
    const imageResponse=await fetch(`${API}/image?${imageParams}`,{headers:{"X-API-KEY":env.KINOPOISK_TOKEN,"Accept":"application/json"}});
    const imageBody=await imageResponse.json().catch(()=>({}));
    if(!imageResponse.ok)return reply({error:"Kinopoisk image query failed",upstreamStatus:imageResponse.status,details:imageBody},imageResponse.status,origin);
    const images=imageBody.docs||imageBody.items||[],byMovie=new Map();
    for(const img of images){if(!img.url||!img.movieId)continue;const key=String(img.movieId);if(!byMovie.has(key))byMovie.set(key,[]);byMovie.get(key).push(img.url)}
    const eligible=docs.map(m=>({id:m.id,title:m.name||m.alternativeName,alternativeName:m.alternativeName||"",year:m.year||"",genres:(m.genres||[]).map(g=>g.name),frames:byMovie.get(String(m.id))|| (m.backdrop?.url?[m.backdrop.url]:[])})).filter(m=>m.title&&m.frames.length);
    for(let i=eligible.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
    return reply({results:eligible.slice(0,count)},200,origin);
  }
  const page=Math.max(1,Number(url.searchParams.get("page")||1)),limit=20,params=new URLSearchParams({page:String(page),limit:String(limit)});
  let endpoint;
  if(url.pathname.endsWith("/search/movie")){
    const query=(url.searchParams.get("query")||"").trim();
    if(!query)return reply({page,results:[],total_pages:0,total_results:0},200,origin);
    endpoint=`${API}/movie/search`;params.set("query",query);
  }else if(url.pathname.endsWith("/discover/movie")){
    endpoint=`${API}/movie`;
    for(const f of ["id","name","alternativeName","year","description","shortDescription","poster","backdrop","rating","genres","premiere"])params.append("selectFields",f);
    params.set("notNullFields","name");
    const sort=url.searchParams.get("sort_by")||"popularity.desc";
    if(sort==="vote_average.desc"){params.set("sortField","rating.kp");params.set("sortType","-1");}
    else if(sort==="release_date.asc"){params.set("sortField","year");params.set("sortType","1");}
    else if(sort==="release_date.desc"){params.set("sortField","year");params.set("sortType","-1");}
    else{params.set("sortField","votes.kp");params.set("sortType","-1");}
    const year=url.searchParams.get("primary_release_year");if(year)params.set("year",year);
    const gid=url.searchParams.get("with_genres");if(gid&&genreById[gid])params.set("genres.name",genreById[gid]);
    params.set("rating.kp","1-10");
  }else return reply({error:"Unknown endpoint"},404,origin);
  const upstream=await fetch(`${endpoint}?${params}`,{headers:{"X-API-KEY":env.KINOPOISK_TOKEN,"Accept":"application/json"}});
  const body=await upstream.json().catch(()=>({}));
  if(!upstream.ok)return reply({error:"Kinopoisk API error",upstreamStatus:upstream.status,details:body},upstream.status,origin);
  const docs=body.docs||body.items||[];const results=Array.isArray(docs)?docs.map(mapMovie):[];
  return reply({page,results,total_pages:body.pages||1,total_results:body.total||results.length},200,origin);
}};
