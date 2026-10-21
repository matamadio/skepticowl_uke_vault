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
| `index.html`, `app.js`, `style.css` | L'app: elenco + visualizzatore |
| `sw.js`, `manifest.webmanifest`, `icons/` | App installabile e uso offline |
| `songs/`, `songs.json` | **Generati** dal build: non modificarli a mano |
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
   - cerca i `.txt` in tutte le sottocartelle (`cazzate/`, `canzonieri/`, ...)
     e ignora tutto il resto (pdf, docx, gp5, midi, immagini, `.lnk` come le
     scalette in `JDuetti/`) e le cartelle che iniziano con un punto;
   - riconosce la codifica (UTF-16 con BOM, UTF-8 con o senza BOM,
     altrimenti cp1252) e salva tutto in UTF-8; spazi e tab restano identici,
     cambia solo il fine riga (CRLF → LF);
   - **cancella e ricrea** `songs/` e `songs.json`;
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
  (o ` – `, trattino medio); se non c'è il separatore l'artista resta vuoto
  e la canzone finisce in fondo, sotto "Senza artista".
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

## Uso dell'app

- **Elenco**: ricerca mentre scrivi (non distingue maiuscole e accenti) su
  artista e titolo; con *cerca nel testo* cerca anche dentro le canzoni.
  Ordine per artista (raggruppato), titolo, ultimo utilizzo o più cliccate.
  Filtro per cartella e *solo preferiti*. La stellina segna i preferiti.
- **Visualizzatore**: come Notepad, carattere monospazio, tab a 8 colonne,
  mai a capo automatico.
  - *Adatta* (predefinita su telefono): riduce il carattere finché la riga più
    lunga entra nello schermo (minimo 3 pt, oltre si scorre di lato).
  - *Originale* (predefinita su PC): dimensione piena, scorrimento orizzontale.
  - *A− / A+*: dimensione del carattere (in *Adatta* è il massimo), ricordata.
  - ▶ scorrimento automatico, con la velocità sul cursore accanto.
  - Lo schermo resta acceso mentre leggi (Wake Lock, dove il browser lo
    supporta).
  - Tastiera su PC: `/` cerca, `Esc` indietro, `+`/`-` carattere,
    `F` cambia modalità, `S` scorrimento automatico.
- **Menu ⋮**: informazioni, stato dell'offline ed **Esporta/Importa JSON**.

Preferiti, contatori, ultimo utilizzo e impostazioni restano **solo nel
browser di quel dispositivo** (localStorage). Per portarli da un dispositivo
all'altro: *Esporta JSON* su uno, *Importa JSON* sull'altro (l'import unisce:
somma i preferiti e tiene i valori più alti). Cancellare i dati del sito dal
browser li elimina.

**Installazione**: dal telefono, *Aggiungi a schermata Home* (Safari) o
*Installa app* (Chrome). Dopo la prima apertura con rete, l'app e tutte le
canzoni sono disponibili anche offline.

## Provare il build sugli esempi

```bash
python tools/build.py tools/esempi
python -m http.server 8000
```
