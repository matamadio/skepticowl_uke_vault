# Skepticowl's song vault

Sito statico (HTML + CSS + JavaScript, niente framework e niente backend) per
leggere da telefono e PC la raccolta di tab e accordi per ukulele in `.txt`.
Gira su GitHub Pages e funziona anche offline.

Le canzoni nel repository adesso sono solo **esempi**
(generati da `tools/esempi/`): vengono sostituiti alla prima esecuzione del
build sulla cartella vera.

## Cosa c'è

| File | A cosa serve |
| --- | --- |
| `tools/build.py` | Legge la cartella dei `.txt`, li converte in UTF-8 e genera `songs/` + `songs.json` |
| `artists.json` | Alias degli artisti → nome giusto (es. `"APC": "A Perfect Circle"`) |
| `song_artists.json` | Artista dei file senza ` - ` nel nome (es. `"Misirlou": "Dick Dale"`) |
| `tags.json` | Tag per i filtri (*Cantautori*, *Demenziale*…): artisti, canzoni, cartelle |
| `config.json` | Sezioni a parte (`cazzate`), cartella dei canzonieri e PDF da escludere |
| `index.html`, `app.js`, `style.css` | L'app: elenco + visualizzatore |
| `sw.js`, `manifest.webmanifest`, `icons/` | App installabile e uso offline |
| `songs/`, `songs.json`, `canzonieri/`, `canzonieri.json` | **Generati** dal build: non modificarli a mano |
| `tools/esempi/` | Txt di prova (tab, accordi allineati, cp1252, UTF-16, righe lunghe) |

## Prima installazione

Serve Python 3.9 o più recente (solo libreria standard) e Git.

1. **Clona il repository fuori da Dropbox** (Dropbox e la cartella `.git` non
   vanno d'accordo), per esempio in `C:\progetti`:

   ```bat
   cd C:\progetti
   git clone https://github.com/matamadio/skepticowl_uke_vault.git
   cd skepticowl_uke_vault
   ```

2. **Genera il sito dai tuoi file**:

   ```bat
   python tools/build.py "X:\Dropbox\Public\Uke"
   ```

   Il build:
   - prende i `.txt` della cartella `Uke` e quelli di `Uke\cazzate` (non
     delle sue sottocartelle), che nel sito compaiono in una sezione a parte
     sotto l'elenco principale. Le altre sottocartelle (`midi/`,
     `JDuetti/`, ...) sono escluse e il riepilogo le elenca. Per includere
     tutto aggiungi `--sottocartelle`;
   - copia i PDF di `Uke\canzonieri` (non delle sue sottocartelle) per la
     pagina *Canzonieri*, tranne quelli esclusi in `config.json`;
   - esclude sempre i file il cui nome inizia con `_` (`.txt` e PDF): è il
     modo più rapido per nascondere una canzone o un canzoniere;
   - ignora tutto ciò che non è `.txt` (pdf, docx, gp5, midi, immagini, `.lnk`);
   - riconosce la codifica (UTF-16 con BOM, UTF-8 con o senza BOM,
     altrimenti cp1252) e salva tutto in UTF-8; spazi e tab restano identici,
     cambia solo il fine riga (CRLF → LF);
   - **cancella e ricrea** `songs/`, `songs.json`, `canzonieri/` e
     `canzonieri.json`;
   - stampa un riepilogo (codifiche, cartelle, file ignorati) e l'elenco
     degli artisti che sembrano scritti in modi diversi.

3. **Controlla in locale** (facoltativo):

   ```bat
   python -m http.server 8000
   ```

   e apri <http://localhost:8000>. (Aprire `index.html` con doppio clic non
   funziona: il browser blocca il caricamento di `songs.json`.)

4. **Commit e push**:

   ```bat
   git add -A
   git commit -m "Canzoni aggiornate"
   git push
   ```

5. **Attiva GitHub Pages**: su GitHub vai in *Settings → Pages*, alla voce
   *Build and deployment* scegli *Source: Deploy from a branch*, branch
   `main`, cartella `/ (root)`, poi *Save*. Dopo un paio di minuti il sito è su
   <https://matamadio.github.io/skepticowl_uke_vault/>.

> Il repository è pubblico: chiunque abbia il link può leggere i testi.

## Aggiornare le canzoni

Ogni volta che aggiungi, modifichi, rinomini o cancelli dei txt in Dropbox:

```bat
cd C:\progetti\skepticowl_uke_vault
git pull
python tools/build.py "X:\Dropbox\Public\Uke"
git add -A
git commit -m "Canzoni aggiornate"
git push
```

Pages si aggiorna da solo dopo il push. Sul telefono basta riaprire il sito
con la rete attiva: l'elenco si aggiorna e le canzoni nuove o modificate
vengono scaricate per l'offline.

### Nomi dei file

- `Artista - Titolo.txt` → artista e titolo. Si divide sul primo ` - `
  (o ` – `, trattino medio; va bene anche `Artista- Titolo`).
- Per i file **senza separatore** l'artista si prende da `song_artists.json`
  (nome del file senza `.txt` → artista; maiuscole e accenti non contano):

  ```json
  { "Hit the road Jack": "Ray Charles", "Misirlou": "Dick Dale" }
  ```

  Quelli che restano senza artista finiscono in fondo, sotto "Senza artista",
  e il build li elenca: aggiungili lì oppure rinomina il file in
  `Artista - Titolo.txt` (rinominare però azzera preferito e contatori).
- **Lo stesso artista scritto in modi diversi viene unito da solo**: non
  contano maiuscole, accenti, spazi doppi, punteggiatura, `The` davanti
  (o `, The` in fondo) e `&` al posto di `and`. Per esempio `The Beatles`,
  `beatles`, `Beatles, The` e `Beatles` diventano un solo artista, e così
  `Fabrizio De Andrè` / `Fabrizio de Andre` o `Guns N' Roses` / `Guns N Roses`.
  Come nome viene mostrata la grafia più usata, evitando quelle tutte
  minuscole o con `, The` in fondo. Il build stampa l'elenco di cosa ha unito.
- I nomi **quasi** uguali (refusi come `Roling Stones` / `Rolling Stones`)
  invece non vengono uniti da soli, perché potrebbero essere artisti
  diversi (`Blur` / `Blue`): il build li elenca alla fine. Se sono lo stesso
  artista, e per le abbreviazioni come `APC`, aggiungi un alias in
  `artists.json` (anche le chiavi degli alias ignorano maiuscole, accenti,
  spazi e `The`), poi rilancia il build:

  ```json
  {
    "APC": "A Perfect Circle",
    "Elio": "Elio e le storie tese",
    "Elio e le stori tese": "Elio e le storie tese"
  }
  ```

- L'id di una canzone dipende dal suo percorso: se **rinomini o sposti** un
  file, preferito, contatore e ultimo utilizzo di quella canzone ripartono da
  zero.

### Tag (tags.json)

I filtri a chip sotto la ricerca (*Strumentali*, *Cantautori*, *Demenziale*…)
vengono da `tags.json`, che si modifica a mano come `artists.json`. Per ogni
tag:

```json
"Cantautori": {
  "artisti": ["Fabrizio de Andrè", "Franco Battiato"],
  "canzoni": ["Bob Dylan - Hurricane"],
  "cartelle": ["cazzate"],
  "escludi": ["Franco Battiato - Strumentale X"]
}
```

- `artisti`: tutti i brani di quegli artisti (maiuscole, accenti e "The" non
  contano); `canzoni`: singoli file, senza `.txt`; `cartelle`: tutta una
  cartella; `escludi`: file da togliere dal tag.
- Due tag si calcolano da soli: `"auto": "strumentali"` (brani quasi senza
  testo) e `"auto": "facili"` (al massimo 5 accordi semplici). Anche lì si
  possono aggiungere `canzoni` o `escludi`.
- L'ordine dei tag nel file è l'ordine dei chip nel sito.
- Il build stampa quante canzoni ha ogni tag e **avvisa se un nome in
  `tags.json` non corrisponde a nessun artista o file** (refusi).

Nel sito: un tocco su un chip filtra (un altro tocco lo toglie), e si combina
con ricerca, preferiti e ordinamento; i tag compaiono anche sotto ogni canzone
e scrivendo il nome di un tag nella ricerca si trovano le sue canzoni.

### Accordi

Il build riconosce gli accordi che sono **una parola isolata** (tra spazi,
tipicamente nella riga sopra il testo) oppure **tra parentesi quadre** dentro
il testo (`[Am]`). Funziona anche la notazione italiana (`Do`, `Lam`, `Sib`…),
ma solo nelle righe fatte di accordi, perché "La", "Re", "Do" sono anche
parole. Le righe di tablatura (`A|--3--`) sono ignorate.

Il build scrive un rapporto in `tools/accordi.txt` (non pubblicato): tutti gli
accordi trovati con il numero di canzoni, quelli presi da righe di testo (da
controllare) e le canzoni senza accordi riconosciuti.

### config.json

```json
{
  "sezioni": ["cazzate"],
  "sezioni_nascoste": ["cazzate"],
  "canzonieri": "canzonieri",
  "canzonieri_esclusi": ["Bozza vecchia", "*scansione*"]
}
```

- `sezioni`: sottocartelle di `Uke` mostrate ognuna in una sezione a parte,
  sotto l'elenco principale (solo i loro `.txt`, non le loro sottocartelle).
- `sezioni_nascoste`: sezioni che nell'app restano nascoste (anche dalla
  ricerca) finché non le sblocchi: **tocca 5 volte di fila il titolo**
  "Skepticowl's song vault" in cima all'elenco. Altri 5 tocchi le
  rinascondono. La scelta vale solo per quel dispositivo. È un trucco, non
  una protezione: i file restano comunque pubblici nel repository.
- `canzonieri`: la sottocartella con i PDF della pagina *Canzonieri*.
- `canzonieri_esclusi`: PDF da non pubblicare, con o senza `.pdf`, senza
  badare alle maiuscole; `*` e `?` funzionano come jolly. GitHub rifiuta i
  file oltre 100 MB: il build salta quelli sopra 95 MB e lo segnala.

## Uso dell'app

- **Elenco**: ricerca mentre scrivi (non distingue maiuscole e accenti) su
  artista e titolo; con *cerca nel testo* cerca anche dentro le canzoni.
  Ordine per artista (raggruppato), titolo, ultimo utilizzo o più cliccate.
  Filtro *solo preferiti* (e per cartella, che compare solo se il build ha
  incluso le sottocartelle). La stellina segna i preferiti. Le canzoni di
  `cazzate` stanno in una sezione a parte, in fondo, nascosta finché non la
  sblocchi (vedi `sezioni_nascoste` sopra).
- **Canzonieri**: la scheda in alto apre l'elenco dei PDF (con ricerca); un
  tocco li apre nel lettore PDF del browser. Quelli aperti restano
  disponibili offline.
- **Playlist**: scheda *Playlist* in alto. *+ Nuova playlist* chiede un nome;
  nella playlist la casella di ricerca serve per trovare le canzoni da
  aggiungere (+). L'ordine si cambia trascinando la maniglia ⋮⋮ o con ▲/▼;
  ✕ toglie una canzone, ✎ rinomina, il cestino elimina la playlist. Dal
  visualizzatore il pulsante ☰+ aggiunge la canzone aperta a una o più
  playlist. Aprendo una canzone da una playlist compare la barra ◀ n/N ▶
  per passare alla precedente/successiva (su PC anche `P`/`N`). Le playlist
  restano sul dispositivo e viaggiano con *Esporta/Importa JSON*.
- **Scorrimento rapido su telefono**: mentre scorri compare una maniglia sul
  bordo destro; trascinala per saltare velocemente in qualsiasi punto.
- **Visualizzatore**: come Notepad, carattere monospazio, tab a 8 colonne,
  mai a capo automatico; su PC il testo sta al centro dello schermo.
  - *Adatta* (predefinita su telefono): riduce il carattere finché la riga più
    lunga entra nello schermo (minimo 3 pt, oltre si scorre di lato).
  - *Originale* (predefinita su PC): dimensione piena, scorrimento orizzontale.
  - *A− / A+*: dimensione del carattere (in *Adatta* è il massimo), ricordata.
  - Gli accordi dentro il testo sono in grassetto colorato (stesse regole del
    riconoscimento, l'allineamento resta identico).
  - **Accordi**: in cima alla canzone i diagrammi (ukulele GCEA) degli accordi
    usati in quel file, nell'ordine in cui compaiono. Un tocco su un
    diagramma mostra un'altra diteggiatura (fino a 4, indicate con 1/4…).
    Il pulsante *Accordi* (o il tasto `C`) li nasconde/mostra.
    Se nel file scrivi una diteggiatura accanto al nome (`Am7 0000`,
    `G9: 4555`, `A = 2104`, `x` per corda muta), viene usata quella.
  - ▶ scorrimento automatico, con la velocità sul cursore accanto.
  - Lo schermo resta acceso mentre leggi (Wake Lock, dove il browser lo
    supporta).
  - Tastiera su PC: `/` cerca, `Esc` indietro, `+`/`-` carattere,
    `F` cambia modalità, `S` scorrimento automatico.
- **Menu ⋮**: informazioni, stato dell'offline ed **Esporta/Importa JSON**.

Preferiti, playlist, contatori, ultimo utilizzo e impostazioni restano **solo nel
browser di quel dispositivo** (localStorage). Per portarli da un dispositivo
all'altro: *Esporta JSON* su uno, *Importa JSON* sull'altro (l'import unisce:
somma i preferiti e tiene i valori più alti). Cancellare i dati del sito dal
browser li elimina.

**Installazione**: su Android (Chrome) compare da solo un invito
*Installa Song vault*; "Non ora" lo rimanda di 14 giorni, e il pulsante resta
comunque nel menu ⋮. Altrimenti, dal telefono, *Aggiungi a schermata Home* (Safari) o
*Installa app* (Chrome). Dopo la prima apertura con rete, l'app e tutte le
canzoni sono disponibili anche offline.

## Provare il build sugli esempi

```bash
python tools/build.py tools/esempi
python -m http.server 8000
```
