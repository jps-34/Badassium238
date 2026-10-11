#engine v8

#feature-id    Badassium238 : Utilities > Badassium238
#feature-info  Finds which emission lines (SII, Ha, OIII) end up with the same hue in the \
   final image, then gives each line its own colour by a hue rotation at constant \
   luminance, with preview and palette presets. Creates a copy, never modifies the \
   original image. Interface in English or French.

/*
 * Badassium238.js  v1.2.2
 * Copyright (c) 2026 Jacques Pouyaud. MIT License (see LICENSE).
 * Code écrit par Claude (Anthropic),
 * sous la direction de Jacques Pouyaud.
 * https://github.com/jps-34/Badassium238
 *
 * v1.2.2 : préréglage « Cuivre et sarcelle ». Palettes : la famille garde ses écarts des
 *   deux côtés de la cible (sans butée), comme la passe 3 de la 1.1 (en 1.2.0 et
 *   1.2.1 l'OIII sortait bleu au lieu de turquoise-vert en Minéral). Les réglages
 *   mémorisés par 1.2 sont repris (Personnalisée retrouvée malgré le nouvel index).
 * v1.2.1 : tolérance jusqu'à 180° (= sans limite), mise par les palettes comme en 1.1.
 * v1.2.0 : réécriture. Un seul moteur de couleur (cible par raie, appartenance
 *   aux familles, resserrement des variations), proposition continue, couleurs
 *   indéterminées détectées, mesure du signal des masters, réglages mémorisés
 *   signalés, bouton Réinitialiser visible. PixInsight 1.9.4 et plus (V8).
 * ----------------------------------------------------------------------------
 * 1. Analyse
 *   - Les trois couches linéaires sans étoiles sont lues (copies), réduites,
 *     lissées, leur fond retiré, SII et OIII mis au niveau de Ha.
 *   - Pour chaque paire de raies : part du signal partagée, variation du
 *     rapport entre les deux, et écart de teinte que ce rapport produit dans
 *     l'image finale. Une paire dont le rapport varie mais dont la teinte ne
 *     suit pas est "confondue" (bichromie).
 *   - Couleur actuelle de chaque raie (moyenne circulaire) et sa
 *     concentration : en dessous d'un seuil, la couleur est "indéterminée".
 *   - Cartes "caractère" (pour une paire confondue : où une raie est plus
 *     forte que d'habitude par rapport à sa partenaire) et proportions des
 *     raies, lissées. Rien sur le fond.
 *
 * 2. Couleurs (aperçu, Appliquer) : un seul moteur
 *   Chaque pixel appartient aux trois familles de couleur (une par raie) selon
 *   les proportions des raies (une paire confondue est partagée par le
 *   caractère). Chaque famille est tournée, dans le plan de chrominance
 *   YCbCr (Rec. 709), de sa couleur actuelle vers sa cible, dosée par la force,
 *   la tolérance (proximité de la couleur actuelle avec la famille) et le
 *   signal ; les variations internes d'une famille peuvent être resserrées.
 *   La luminance Y = 0,2126 R + 0,7152 V + 0,0722 B est conservée exactement.
 *   Garde-fou : si la nouvelle couleur sort des couleurs affichables, sa
 *   saturation est réduite juste assez ; aucun canal ne dépasse
 *   max(0,99 ; sa valeur d'origine).
 *
 * Les trois couches linéaires ne servent qu'à repérer où chaque raie domine
 * (zones de recouvrement) ; c'est l'image finale étirée qui change de couleur.
 */

var TITLE = "Badassium238";
var VERSION = "1.2.2";
var LANG_KEY = "Badassium238/language";
var LANG = "en";
var TIPS = {};

// ============================================================================
// Langue
// ============================================================================

function detectLanguage()
{
   try
   {
      var saved = Settings.read( LANG_KEY, DataType.String );
      if ( saved == "fr" || saved == "en" )
         return saved;
   }
   catch ( e ) {}
   var names = [ "LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG" ];
   for ( var i = 0; i < names.length; ++i )
   {
      try
      {
         var v = "";
         if ( typeof System !== "undefined" && System.getEnvironmentVariable )
            v = System.getEnvironmentVariable( names[i] );
         else if ( typeof getEnvironmentVariable === "function" )
            v = getEnvironmentVariable( names[i] );
         if ( v && v.length > 0 && v != "C" && v != "POSIX" )
            return v.toLowerCase().indexOf( "fr" ) == 0 ? "fr" : "en";
      }
      catch ( e ) {}
   }
   try
   {
      var loc = Intl.DateTimeFormat().resolvedOptions().locale;
      if ( loc && loc.toLowerCase().indexOf( "fr" ) == 0 )
         return "fr";
   }
   catch ( e ) {}
   return "en";
}

function saveLanguage( lang )
{
   try { Settings.write( LANG_KEY, DataType.String, lang ); } catch ( e ) {}
}

function L( fr, en )
{
   return LANG == "fr" ? fr : en;
}

// ============================================================================
// Paramètres
// ============================================================================

var SETTINGS_KEY = "Badassium238/settings12";   // nouvelle clé : les réglages 1.0/1.1 ne sont pas repris
var LINES = [ "SII", "Ha", "OIII" ];
var ORDERS = [ "SHO", "SOH", "HSO", "HOS", "OSH", "OHS" ];
var LETTER = [ "S", "H", "O" ];
var UNDEFINED_R = 0.35;      // concentration de teinte en dessous de laquelle une couleur est "indéterminée"
var HA_GOLD_MAX = 48;        // la proposition ne pousse pas le Ha au-delà (jaune-vert à l'écran)

// Préréglages : [ nom fr, nom en, SII, Ha, OIII, saturation, resserrement, zones mixtes ]
var PRESETS = [
   [ "Proposition (séparer les raies confondues)", "Proposal (split the merged lines)", NaN, NaN, NaN, 1, 0, 0 ],
   [ "SII rouge, Ha or, OIII bleu", "SII red, Ha gold, OIII blue", 5, 45, 225, 1, 0.5, 1 ],
   [ "Ha rouge, SII or, OIII bleu", "Ha red, SII gold, OIII blue", 45, 0, 225, 1, 0.5, 1 ],
   [ "Vraies couleurs (longueurs d'onde)", "True colours (wavelengths)", 355, 355, 160, 1, 0.5, 1 ],
   [ "Naturel rouge / turquoise", "Natural red / teal", 345, 355, 185, 0.85, 0.5, 1 ],
   [ "Minéral (doux)", "Mineral (soft)", 20, 38, 205, 0.55, 0.5, 1 ],
   [ "Cuivre et sarcelle", "Copper and teal", 12, 32, 185, 0.85, 0.5, 1 ],
   [ "Personnalisée", "Custom", NaN, NaN, NaN, NaN, NaN, NaN ]
];
var PRESET_PROPOSAL = 0;
var PRESET_CUSTOM = PRESETS.length - 1;

var T_KEYS   = [ "tS", "tH", "tO" ];
var F_KEYS   = [ "fS", "fH", "fO" ];
var W_KEYS   = [ "wS", "wH", "wO" ];
var SAT_KEYS = [ "satS", "satH", "satO" ];

var DEFAULTS = {
   sId: "", hId: "", oId: "", tId: "", lastIds: "",
   order: 0,
   blurLines: 20, blurMap: 10, blurColor: 5, split: 25, sigPct: 60,
   sharpPair: 2, sharpFam: 3,
   autoBg: true,      bgS: 0.145, bgH: 0.145, bgO: 0.145,
   autoWeights: true, kS: 2.46, kO: 6.06,
   preset: 0, nPresets: PRESETS.length, tight: 0, mixed: 0,
   tS: 22, tH: 22, tO: 296,
   fS: 0, fH: 0, fO: 0,
   wS: 60, wH: 60, wO: 45,
   satS: 1, satH: 1, satO: 1,
   showAdvanced: false
};

var STR_KEYS  = [ "sId", "hId", "oId", "tId", "lastIds" ];
var BOOL_KEYS = [ "autoBg", "autoWeights", "showAdvanced" ];
var REAL_KEYS = [ "order", "blurLines", "blurMap", "blurColor", "split", "sigPct", "sharpPair", "sharpFam",
                  "bgS", "bgH", "bgO", "kS", "kO", "preset", "nPresets", "tight", "mixed" ].concat( T_KEYS, F_KEYS, W_KEYS, SAT_KEYS );
// réglages dont la restauration d'une session précédente mérite un avertissement
var NOTICE_KEYS = [ "blurLines", "blurMap", "blurColor", "split", "sigPct", "sharpPair", "sharpFam", "tight", "mixed" ];

var TP = {};

function resetTP()
{
   for ( var key in DEFAULTS )
      TP[key] = DEFAULTS[key];
}

function saveParameters()
{
   for ( var i = 0; i < STR_KEYS.length; ++i )  Parameters.set( STR_KEYS[i],  TP[STR_KEYS[i]] );
   for ( var i = 0; i < BOOL_KEYS.length; ++i ) Parameters.set( BOOL_KEYS[i], TP[BOOL_KEYS[i]] );
   for ( var i = 0; i < REAL_KEYS.length; ++i ) Parameters.set( REAL_KEYS[i], TP[REAL_KEYS[i]] );
}

function loadParameters()
{
   for ( var i = 0; i < STR_KEYS.length; ++i )
      if ( Parameters.has( STR_KEYS[i] ) ) TP[STR_KEYS[i]] = Parameters.getString( STR_KEYS[i] );
   for ( var i = 0; i < BOOL_KEYS.length; ++i )
      if ( Parameters.has( BOOL_KEYS[i] ) ) TP[BOOL_KEYS[i]] = Parameters.getBoolean( BOOL_KEYS[i] );
   for ( var i = 0; i < REAL_KEYS.length; ++i )
      if ( Parameters.has( REAL_KEYS[i] ) ) TP[REAL_KEYS[i]] = Parameters.getReal( REAL_KEYS[i] );
   fixPresetIndex( Parameters.has( "nPresets" ) ? Parameters.getReal( "nPresets" ) : 7 );
}

function saveSettings()
{
   try { Settings.write( SETTINGS_KEY, DataType.String, JSON.stringify( TP ) ); } catch ( e ) {}
}

function loadSettings()
{
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType.String );
      if ( s != null && s.length > 0 )
      {
         var o = JSON.parse( s );
         for ( var key in DEFAULTS )
            if ( o[key] !== undefined && typeof o[key] === typeof DEFAULTS[key] )
               TP[key] = o[key];
         fixPresetIndex( typeof o.nPresets === "number" ? o.nPresets : 7 );   // 1.2.x : 7 préréglages
      }
   }
   catch ( e ) {}
}

// Réglages écrits par une version qui avait un autre nombre de préréglages : Personnalisée
// (toujours le dernier) garde son sens, un index devenu invalide retombe sur la proposition.
function fixPresetIndex( nSaved )
{
   if ( TP.preset == nSaved - 1 )
      TP.preset = PRESET_CUSTOM;
   else if ( !( TP.preset >= 0 && TP.preset < PRESET_CUSTOM ) )
      TP.preset = PRESET_PROPOSAL;
   TP.nPresets = PRESETS.length;
}

// Réglages restaurés qui ne sont pas ceux par défaut (hors images et cibles)
function restoredNotice()
{
   var diff = [];
   for ( var i = 0; i < NOTICE_KEYS.length; ++i )
   {
      var k = NOTICE_KEYS[i];
      if ( TP[k] !== DEFAULTS[k] )
         diff.push( k );
   }
   if ( !TP.autoBg ) diff.push( L( "fonds manuels", "manual backgrounds" ) );
   if ( !TP.autoWeights ) diff.push( L( "poids manuels", "manual weights" ) );
   if ( TP.preset == PRESET_CUSTOM ) diff.push( L( "cibles personnalisées", "custom targets" ) );
   return diff;
}

// ============================================================================
// Outils généraux
// ============================================================================

function log( s )
{
   console.writeln( s );
   console.flush();
}

function errText( e )
{
   return ( e && e.message ) ? e.message : String( e );
}

function userError( msg )
{
   var e = new Error( msg );
   e.isUser = true;
   return e;
}

function reportError( where, e )
{
   console.criticalln( TITLE + " (" + where + ") : " + errText( e ) );
   if ( e && e.stack && !e.isUser )
      console.writeln( String( e.stack ) );
   console.flush();
}

function findView( id )
{
   if ( id == null || id.length == 0 )
      return null;
   var v = View.viewById( id );
   return ( v == null || v.isNull ) ? null : v;
}

function validId( base )
{
   var id = base.replace( /[^A-Za-z0-9_]/g, "_" );
   if ( /^[0-9]/.test( id ) )
      id = "_" + id;
   if ( findView( id ) == null )
      return id;
   var n = 1;
   while ( findView( id + n ) != null )
      ++n;
   return id + n;
}

function closeView( v )
{
   if ( v != null && !v.isNull )
      v.window.forceClose();
}

// Copie 32 bits flottants normalisée [0,1] (PixelMath, fenêtre cachée).
function floatCopy( srcView, newId )
{
   var P = new PixelMath;
   P.expression = "$T";
   P.expression1 = "";
   P.expression2 = "";
   P.expression3 = "";
   P.useSingleExpression = true;
   P.symbols = "";
   P.generateOutput = true;
   P.singleThreaded = false;
   P.optimization = true;
   P.use64BitWorkingImage = false;
   P.rescale = false;
   P.rescaleLower = 0;
   P.rescaleUpper = 1;
   P.truncate = true;
   P.truncateLower = 0;
   P.truncateUpper = 1;
   P.createNewImage = true;
   P.showNewImage = false;
   P.newImageId = newId;
   P.newImageWidth = 0;
   P.newImageHeight = 0;
   P.newImageAlpha = false;
   P.newImageColorSpace = PixelMath.SameAsTarget;
   P.newImageSampleFormat = PixelMath.f32;
   if ( !P.executeOn( srcView ) )
      throw new Error( L( "Copie de " + srcView.id + " impossible", "Cannot copy " + srcView.id ) );
   var v = findView( newId );
   if ( v == null )
      throw new Error( L( "Copie " + newId + " introuvable", "Copy " + newId + " not found" ) );
   return v;
}

// Moyenne par blocs s x s d'un canal (et histogramme 16 bits optionnel).
function blockAverage( view, channel, s, hist )
{
   var img = view.image;
   var W = img.width, H = img.height;
   var ww = Math.ceil( W / s ), wh = Math.ceil( H / s );
   var acc = new Float64Array( ww * wh );
   var I = new ImageIterator( img, channel );
   for ( var y = 0; y < H; ++y )
   {
      var row = I[y];
      var base = Math.floor( y / s ) * ww;
      for ( var x = 0; x < W; ++x )
      {
         var v = row[x];
         acc[base + Math.floor( x / s )] += v;
         if ( hist )
         {
            var b = Math.round( v * 65535 );
            if ( b > 0 && b < 65535 )
               ++hist[b];
         }
      }
   }
   var out = new Float32Array( ww * wh );
   for ( var by = 0; by < wh; ++by )
   {
      var ny = Math.min( s, H - by * s );
      for ( var bx = 0; bx < ww; ++bx )
      {
         var nx = Math.min( s, W - bx * s );
         out[by * ww + bx] = acc[by * ww + bx] / ( nx * ny );
      }
   }
   return out;
}

function histogramPeak( hist )
{
   var best = 1;
   for ( var b = 2; b < 65535; ++b )
      if ( hist[b] > hist[best] )
         best = b;
   return best / 65535;
}

// Flou gaussien séparable, bords en miroir.
function gaussBlur( src, w, h, sigma )
{
   if ( !( sigma > 0.3 ) )
      return Float32Array.from( src );
   var r = Math.ceil( 4 * sigma );
   var k = new Float64Array( 2 * r + 1 ), sum = 0;
   for ( var j = -r; j <= r; ++j )
   {
      k[j + r] = Math.exp( -j * j / ( 2 * sigma * sigma ) );
      sum += k[j + r];
   }
   for ( var j = 0; j < k.length; ++j )
      k[j] /= sum;
   var tmp = new Float32Array( w * h ), dst = new Float32Array( w * h );
   var pass = function( a, b, len, count, stride, step )
   {
      var line = new Float64Array( len + 2 * r );
      for ( var c = 0; c < count; ++c )
      {
         var o = c * stride;
         for ( var t = 0; t < len; ++t )
            line[t + r] = a[o + t * step];
         for ( var t = 0; t < r; ++t )
         {
            line[r - 1 - t] = line[r + Math.min( t, len - 1 )];
            line[r + len + t] = line[r + len - 1 - Math.min( t, len - 1 )];
         }
         for ( var t = 0; t < len; ++t )
         {
            var acc = 0;
            for ( var j = 0; j < k.length; ++j )
               acc += k[j] * line[t + j];
            b[o + t * step] = acc;
         }
      }
   };
   pass( src, tmp, w, h, w, 1 );
   pass( tmp, dst, h, w, 1, w );
   return dst;
}

function percentileOf( arr, p )
{
   var a = Float64Array.from( arr );
   if ( a.length == 0 )
      return NaN;
   a.sort();
   var pos = ( p / 100 ) * ( a.length - 1 );
   var i = Math.floor( pos ), f = pos - i;
   return ( i + 1 < a.length ) ? a[i] * ( 1 - f ) + a[i + 1] * f : a[i];
}

function clamp( v, a, b )
{
   return v < a ? a : ( v > b ? b : v );
}

function wrapDeg( d )
{
   d = ( d + 180 ) % 360;
   if ( d < 0 )
      d += 360;
   return d - 180;
}

function wrap360( d )
{
   d = d % 360;
   return d < 0 ? d + 360 : d;
}

function wrapRad( d )
{
   var tp = 2 * Math.PI;
   d = ( d + Math.PI ) % tp;
   if ( d < 0 )
      d += tp;
   return d - Math.PI;
}

function smooth01( x )
{
   x = clamp( x, 0, 1 );
   return x * x * ( 3 - 2 * x );
}

// Teinte HSV en degrés, -1 si gris.
function hueDeg( r, g, b )
{
   var mx = Math.max( r, g, b ), mn = Math.min( r, g, b ), d = mx - mn;
   if ( d < 1e-6 )
      return -1;
   var h;
   if ( mx == r )
      h = ( ( g - b ) / d ) % 6;
   else if ( mx == g )
      h = ( b - r ) / d + 2;
   else
      h = ( r - g ) / d + 4;
   h *= 60;
   return h < 0 ? h + 360 : h;
}

function rgbOfHue( hdeg )
{
   var h = wrap360( hdeg ) / 60, x = 1 - Math.abs( h % 2 - 1 );
   if ( h < 1 ) return [ 1, x, 0 ];
   if ( h < 2 ) return [ x, 1, 0 ];
   if ( h < 3 ) return [ 0, 1, x ];
   if ( h < 4 ) return [ 0, x, 1 ];
   if ( h < 5 ) return [ x, 0, 1 ];
   return [ 1, 0, x ];
}

// Angle de la teinte HSV dans le plan (Cb, Cr) Rec. 709.
function ycAngleOfHue( hdeg )
{
   var c = rgbOfHue( hdeg );
   var Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
   return Math.atan2( ( c[0] - Y ) / 1.5748, ( c[2] - Y ) / 1.8556 );
}

function hexOfHue( hdeg )
{
   var c = rgbOfHue( hdeg );
   var hx = function( v ) { var s = Math.round( v * 255 ).toString( 16 ); return s.length < 2 ? "0" + s : s; };
   return "#" + hx( c[0] ) + hx( c[1] ) + hx( c[2] );
}

// Moyenne circulaire de la teinte (pondérée par la saturation) sur un masque :
// { hue: degrés, R: concentration 0..1 (1 = toutes les teintes identiques), n }
function meanHue( fr, fg, fb, mask )
{
   var sx = 0, sy = 0, sw = 0, n = 0;
   for ( var i = 0; i < mask.length; ++i )
      if ( mask[i] )
      {
         var r = fr[i], g = fg[i], b = fb[i];
         var mx = Math.max( r, g, b ), mn = Math.min( r, g, b );
         if ( mx <= 0 )
            continue;
         var h = hueDeg( r, g, b );
         if ( h < 0 )
            continue;
         var sat = ( mx - mn ) / mx, a = h * Math.PI / 180;
         sx += sat * Math.cos( a );
         sy += sat * Math.sin( a );
         sw += sat;
         ++n;
      }
   if ( n == 0 || sw <= 0 )
      return { hue: NaN, R: 0, n: n };
   return { hue: wrap360( Math.atan2( sy, sx ) * 180 / Math.PI ), R: Math.sqrt( sx * sx + sy * sy ) / sw, n: n };
}

// ============================================================================
// 1. Analyse
// ============================================================================

var ANA = null;   // résultat de la dernière analyse

function analysisKey( p )
{
   return JSON.stringify( [ p.sId, p.hId, p.oId, p.tId, p.blurLines, p.blurMap, p.blurColor, p.sigPct,
      p.autoBg, p.autoBg ? 0 : [ p.bgS, p.bgH, p.bgO ], p.autoWeights, p.autoWeights ? 0 : [ p.kS, p.kO ] ] );
}

function checkInputs( p )
{
   var S = findView( p.sId ), H = findView( p.hId ), O = findView( p.oId ), T = findView( p.tId );
   if ( S == null || H == null || O == null )
      throw userError( L( "Choisir les trois couches linéaires SII, Ha et OIII.", "Select the three linear SII, Ha and OIII masters." ) );
   if ( T == null )
      throw userError( L( "Choisir l'image finale étirée.", "Select the final stretched image." ) );
   var lines = [ S, H, O ];
   for ( var i = 0; i < 3; ++i )
      if ( lines[i].image.isColor )
         throw userError( lines[i].id + L( " est en couleur : il faut une couche en niveaux de gris.", " is a colour image: a grayscale master is needed." ) );
   if ( !T.image.isColor )
      throw userError( T.id + L( " n'est pas une image RVB.", " is not an RGB image." ) );
   var w = T.image.width, h = T.image.height;
   for ( var i = 0; i < 3; ++i )
      if ( lines[i].image.width != w || lines[i].image.height != h )
         throw userError( lines[i].id + " (" + lines[i].image.width + "x" + lines[i].image.height +
            ") " + L( "n'a pas les dimensions de ", "does not have the size of " ) + T.id + " (" + w + "x" + h + "). " +
            L( "Les couches doivent être alignées pixel à pixel avec l'image finale.",
               "The masters must be pixel-aligned with the final image." ) );
   return { S: S, H: H, O: O, T: T };
}

// Format des échantillons d'une vue : "f32", "u16"... ou "" si inconnu.
function sampleFormatOf( view )
{
   try
   {
      var img = view.image;
      if ( typeof img.isReal === "boolean" && typeof img.bitsPerSample === "number" )
         return ( img.isReal ? "f" : "u" ) + img.bitsPerSample;
   }
   catch ( e ) {}
   return "";
}

function analyse( p )
{
   var t0 = Date.now();
   var v = checkInputs( p );
   var W = v.T.image.width, H = v.T.image.height;
   var s = Math.max( 1, Math.round( Math.max( W, H ) / 1800 ) );
   var ww = Math.ceil( W / s ), wh = Math.ceil( H / s ), n = ww * wh;
   log( "<b>" + TITLE + L( " : analyse</b> (", ": analysis</b> (" ) + W + "x" + H + L( ", travail en ", ", working size " ) + ww + "x" + wh + ")" );

   // Lecture des couches (copies) : moyennes par blocs + histogrammes 16 bits
   var raw = [], hists = [], fmt = [];
   var srcLines = [ v.S, v.H, v.O ];
   for ( var i = 0; i < 3; ++i )
   {
      log( L( "  lecture de ", "  reading " ) + LINES[i] + " (" + srcLines[i].id + ")" );
      CoreApplication.processEvents();
      fmt[i] = sampleFormatOf( srcLines[i] );
      var cp = floatCopy( srcLines[i], validId( "B238_tmp" ) );
      try
      {
         hists[i] = new Uint32Array( 65536 );
         raw[i] = blockAverage( cp, 0, s, hists[i] );
      }
      finally
      {
         closeView( cp );
      }
      CoreApplication.processEvents();
   }
   log( L( "  lecture de l'image finale (", "  reading the final image (" ) + v.T.id + ")" );
   CoreApplication.processEvents();
   var cpT = floatCopy( v.T, validId( "B238_tmp" ) );
   var fr, fg, fb;
   try
   {
      fr = blockAverage( cpT, 0, s );
      fg = blockAverage( cpT, 1, s );
      fb = blockAverage( cpT, 2, s );
   }
   finally
   {
      closeView( cpT );
   }

   if ( p.autoBg )
   {
      p.bgS = histogramPeak( hists[0] );
      p.bgH = histogramPeak( hists[1] );
      p.bgO = histogramPeak( hists[2] );
   }
   var bg = [ p.bgS, p.bgH, p.bgO ];

   // Couches lissées, fond retiré
   var sig = p.blurLines / s;
   var Lb = [];
   for ( var i = 0; i < 3; ++i )
      Lb[i] = gaussBlur( raw[i], ww, wh, sig );
   var ex = [ new Float32Array( n ), new Float32Array( n ), new Float32Array( n ) ];
   for ( var j = 0; j < n; ++j )
      for ( var i = 0; i < 3; ++i )
         ex[i][j] = Math.max( 0, Lb[i][j] - bg[i] );

   // Qualité du signal de chaque master : médiane et 99e centile au-dessus du fond (en 1/65535)
   var quality = [];
   for ( var i = 0; i < 3; ++i )
   {
      var above = [];
      for ( var j = 0; j < n; j += 4 )
         above.push( Math.max( 0, raw[i][j] - bg[i] ) * 65535 );
      quality[i] = { p50: percentileOf( above, 50 ), p99: percentileOf( above, 99 ), fmt: fmt[i] };
   }

   // Mise à niveau sur Ha (zones où Ha est le plus fort)
   if ( p.autoWeights )
   {
      var p70 = percentileOf( ex[1], 70 );
      var hz = [], sz = [], oz = [];
      for ( var j = 0; j < n; ++j )
         if ( ex[1][j] > p70 )
         {
            hz.push( ex[1][j] );
            sz.push( ex[0][j] );
            oz.push( ex[2][j] );
         }
      var mh = percentileOf( hz, 50 ), ms = percentileOf( sz, 50 ), mo = percentileOf( oz, 50 );
      if ( !( mh > 0 && ms > 0 && mo > 0 ) )
         throw userError( L( "Poids auto impossibles (signal nul au-dessus du fond). Vérifier les fonds.", "Automatic weights failed (no signal above background). Check the background levels." ) );
      p.kS = mh / ms;
      p.kO = mh / mo;
   }
   var kk = [ p.kS, 1, p.kO ];

   // Proportions et poids du signal
   var pr = [ new Float32Array( n ), new Float32Array( n ), new Float32Array( n ) ];
   var tot = new Float32Array( n ), on = new Uint8Array( n ), totOn = [];
   for ( var j = 0; j < n; ++j )
   {
      var a = ex[0][j] * kk[0], b = ex[1][j], c = ex[2][j] * kk[2], t = a + b + c;
      tot[j] = t;
      if ( t > 0 )
      {
         pr[0][j] = a / t;
         pr[1][j] = b / t;
         pr[2][j] = c / t;
      }
      if ( t > 0 && Lb[1][j] > bg[1] + 0.000002 )
      {
         on[j] = 1;
         totOn.push( t );
      }
   }
   if ( totOn.length == 0 )
      throw userError( L( "Aucun signal Ha au-dessus du fond : fond Ha trop haut ?", "No Ha signal above background: Ha background too high?" ) );
   var tRef = percentileOf( totOn, p.sigPct );
   var wsig = new Float32Array( n ), L0 = new Float32Array( n ), sigMask = new Uint8Array( n ), nSig = 0;
   for ( var j = 0; j < n; ++j )
   {
      wsig[j] = on[j] ? clamp( tot[j] / tRef, 0, 1 ) : 0;
      L0[j] = 0.2126 * fr[j] + 0.7152 * fg[j] + 0.0722 * fb[j];
      if ( wsig[j] > 0.3 && L0[j] > 0.12 )
      {
         sigMask[j] = 1;
         ++nSig;
      }
   }

   // Diagnostic des paires
   var pairs = [ [ 0, 1 ], [ 0, 2 ], [ 1, 2 ] ];
   var diag = [];
   var d = new Float32Array( n );
   for ( var q = 0; q < 3; ++q )
   {
      var A = pairs[q][0], B = pairs[q][1];
      var zone = new Uint8Array( n ), dz = [], zoneU = [], nz = 0;
      for ( var j = 0; j < n; ++j )
      {
         var sAB = pr[A][j] + pr[B][j];
         d[j] = sAB > 0 ? ( pr[A][j] - pr[B][j] ) / sAB : 0;
         if ( on[j] && L0[j] > 0.12 && sAB >= 0.6 )
            zoneU.push( d[j] );
         if ( sigMask[j] && sAB >= 0.6 )
         {
            zone[j] = 1;
            dz.push( d[j] );
            ++nz;
         }
      }
      var D = { a: A, b: B, overlap: nSig ? 100 * nz / nSig : 0, n: nz };
      if ( nz < 200 || zoneU.length < 200 )
      {
         D.verdict = "low";
         D.confused = false;
         diag.push( D );
         continue;
      }
      D.p10 = percentileOf( dz, 10 );
      D.p90 = percentileOf( dz, 90 );
      var top = new Uint8Array( n ), bot = new Uint8Array( n );
      for ( var j = 0; j < n; ++j )
         if ( zone[j] )
         {
            if ( d[j] >= D.p90 ) top[j] = 1;
            if ( d[j] <= D.p10 ) bot[j] = 1;
         }
      var mA = meanHue( fr, fg, fb, top ), mB = meanHue( fr, fg, fb, bot ), m0 = meanHue( fr, fg, fb, zone );
      D.hueA = mA.hue;     // là où A est relativement plus fort
      D.hueB = mB.hue;     // là où B est relativement plus fort
      D.h0 = m0.hue;
      D.R0 = m0.R;
      D.sep = wrapDeg( D.hueB - D.hueA );
      D.spread = D.p90 - D.p10;
      D.med = percentileOf( zoneU, 50 );
      var dev = [];
      for ( var j = 0; j < zoneU.length; ++j )
         dev.push( Math.abs( zoneU[j] - D.med ) );
      D.scale = Math.max( 1e-4, percentileOf( dev, 95 ) );
      D.confused = D.spread >= 0.1 && Math.abs( D.sep ) < 10 && D.R0 >= UNDEFINED_R;
      D.verdict = D.confused ? "merged" : ( Math.abs( D.sep ) >= 25 ? "sep" : "partial" );
      D.pairable = D.confused || D.verdict == "partial";   // partagée par le caractère dans le moteur
      diag.push( D );
   }

   // Couleur actuelle de chaque raie et sa concentration
   var fam = [ NaN, NaN, NaN ], famR = [ 0, 0, 0 ], inPair = [ -1, -1, -1 ];
   for ( var q = 0; q < 3; ++q )
      if ( diag[q].confused )
      {
         fam[diag[q].a] = diag[q].h0;
         fam[diag[q].b] = diag[q].h0;
         famR[diag[q].a] = diag[q].R0;
         famR[diag[q].b] = diag[q].R0;
         inPair[diag[q].a] = q;
         inPair[diag[q].b] = q;
      }
   for ( var i = 0; i < 3; ++i )
      if ( isNaN( fam[i] ) )
      {
         var m = new Uint8Array( n );
         for ( var j = 0; j < n; ++j )
            if ( sigMask[j] && pr[i][j] >= pr[( i + 1 ) % 3][j] && pr[i][j] >= pr[( i + 2 ) % 3][j] )
               m[j] = 1;
         var mh2 = meanHue( fr, fg, fb, m );
         fam[i] = mh2.hue;
         famR[i] = mh2.R;
         if ( isNaN( fam[i] ) )
         {
            fam[i] = [ 10, 40, 220 ][i];
            famR[i] = 0;
         }
      }
   var famOk = [ famR[0] >= UNDEFINED_R, famR[1] >= UNDEFINED_R, famR[2] >= UNDEFINED_R ];

   // Dispersion de teinte de chaque famille (90e centile de l'écart à sa couleur)
   var famSpread = [ 30, 30, 30 ];
   for ( var i = 0; i < 3; ++i )
   {
      var devs = [];
      for ( var j = 0; j < n; ++j )
      {
         if ( !sigMask[j] )
            continue;
         var inFam;
         if ( inPair[i] >= 0 )
         {
            var Dq = diag[inPair[i]];
            inFam = pr[Dq.a][j] + pr[Dq.b][j] >= 0.6;
         }
         else
            inFam = pr[i][j] >= pr[( i + 1 ) % 3][j] && pr[i][j] >= pr[( i + 2 ) % 3][j];
         if ( !inFam )
            continue;
         var hh = hueDeg( fr[j], fg[j], fb[j] );
         if ( hh >= 0 )
            devs.push( Math.abs( wrapDeg( hh - fam[i] ) ) );
      }
      if ( devs.length > 100 )
         famSpread[i] = percentileOf( devs, 90 );
   }

   // Cartes "caractère" : pour une paire confondue ou en partie séparée, où une raie est plus forte
   // que d'habitude par rapport à sa partenaire (de -1 à 1, dans ch[a] et ch[b]) ; pondérées par le signal.
   var ch = [ new Float32Array( n ), new Float32Array( n ), new Float32Array( n ) ];
   for ( var q = 0; q < 3; ++q )
   {
      var D = diag[q];
      if ( !D.pairable )
         continue;
      for ( var j = 0; j < n; ++j )
      {
         var sAB = pr[D.a][j] + pr[D.b][j];
         if ( sAB <= 0 )
            continue;
         var u = clamp( ( ( pr[D.a][j] - pr[D.b][j] ) / sAB - D.med ) / D.scale, -1, 1 ) *
                 clamp( ( sAB - 0.5 ) / 0.4, 0, 1 );
         if ( u > ch[D.a][j] ) ch[D.a][j] = u;
         if ( -u > ch[D.b][j] ) ch[D.b][j] = -u;
      }
   }
   for ( var i = 0; i < 3; ++i )
   {
      for ( var j = 0; j < n; ++j )
         ch[i][j] *= wsig[j];
      ch[i] = gaussBlur( ch[i], ww, wh, p.blurMap / s );
   }
   // Proportions lissées (appartenance aux familles)
   var prs = [];
   for ( var i = 0; i < 3; ++i )
   {
      var tmp = new Float32Array( n );
      for ( var j = 0; j < n; ++j )
         tmp[j] = pr[i][j] * wsig[j];
      prs[i] = gaussBlur( tmp, ww, wh, p.blurMap / s );
   }
   var sigMap = gaussBlur( wsig, ww, wh, p.blurMap / s );
   for ( var i = 0; i < 3; ++i )
      for ( var j = 0; j < n; ++j )
         prs[i][j] = sigMap[j] > 1e-6 ? prs[i][j] / sigMap[j] : 0;

   // Couleur lissée de l'image finale (pour la tolérance)
   var ys = new Float32Array( n ), cb = new Float32Array( n ), cr = new Float32Array( n );
   for ( var j = 0; j < n; ++j )
   {
      ys[j] = L0[j];
      cb[j] = ( fb[j] - L0[j] ) / 1.8556;
      cr[j] = ( fr[j] - L0[j] ) / 1.5748;
   }
   var sc = p.blurColor / s;
   ys = gaussBlur( ys, ww, wh, sc );
   cb = gaussBlur( cb, ww, wh, sc );
   cr = gaussBlur( cr, ww, wh, sc );

   ANA = {
      key: analysisKey( p ), ids: [ p.sId, p.hId, p.oId, p.tId ].join( "|" ),
      W: W, H: H, s: s, ww: ww, wh: wh,
      fr: fr, fg: fg, fb: fb, ch: ch, pr: prs, sig: sigMap, ys: ys, cb: cb, cr: cr,
      diag: diag, fam: fam, famR: famR, famOk: famOk, famSpread: famSpread, inPair: inPair,
      bg: bg, kS: p.kS, kO: p.kO, quality: quality
   };

   // Console
   var man = L( " (manuel)", " (manual)" ), auto = " (auto)";
   log( format( L( "  Fonds : SII %.6f  Ha %.6f  OIII %.6f%s | poids : SII x%.3f  OIII x%.3f%s",
                   "  Backgrounds: SII %.6f  Ha %.6f  OIII %.6f%s | weights: SII x%.3f  OIII x%.3f%s" ),
        p.bgS, p.bgH, p.bgO, p.autoBg ? auto : man, p.kS, p.kO, p.autoWeights ? auto : man ) );
   for ( var i = 0; i < 3; ++i )
   {
      var Q = quality[i], warn = "";
      if ( Q.fmt.length > 0 && Q.fmt.charAt( 0 ) == "u" )
         warn += L( "  <- image entière " + Q.fmt + " : précision réduite, préférer 32 bits flottant", "  <- integer " + Q.fmt + " image: reduced precision, prefer 32-bit float" );
      log( format( L( "  Signal %-4s au-dessus du fond : médiane %.1f, 99e centile %.1f (unités 1/65535)%s",
                      "  Signal %-4s above background: median %.1f, 99th percentile %.1f (units of 1/65535)%s" ),
           LINES[i], Q.p50, Q.p99, warn ) );
   }
   for ( var q = 0; q < 3; ++q )
   {
      var D = diag[q];
      if ( D.p10 === undefined )
         log( "  " + LINES[D.a] + "/" + LINES[D.b] + " : " + verdictText( D ) );
      else
         log( format( L( "  %s/%s : partagent %.0f%% du signal | rapport de %+.2f à %+.2f | écart de teinte %.0f° -> %s",
                         "  %s/%s: share %.0f%% of the signal | ratio from %+.2f to %+.2f | hue difference %.0f° -> %s" ),
              LINES[D.a], LINES[D.b], D.overlap, D.p10, D.p90, Math.abs( D.sep ), verdictText( D ) ) );
   }
   var cur = [];
   for ( var i = 0; i < 3; ++i )
      cur.push( LINES[i] + " " + ( famOk[i] ? format( "%.0f° (±%.0f°, %.2f)", fam[i], famSpread[i], famR[i] )
                                             : L( "indéterminée", "undefined" ) + format( " (%.2f)", famR[i] ) ) );
   log( L( "  Couleur actuelle (concentration) : ", "  Current colour (concentration): " ) + cur.join( "  " ) );
   log( format( L( "  Analyse en %.1f s", "  Analysis done in %.1f s" ), ( Date.now() - t0 ) / 1000 ) );
   return ANA;
}

function verdictText( D )
{
   switch ( D.verdict )
   {
   case "low":    return L( "pas assez de signal", "not enough signal" );
   case "merged": return L( "confondues", "merged" );
   case "sep":    return L( "bien séparées", "well separated" );
   default:       return L( "en partie séparées", "partly separated" );
   }
}

// Phrase de résumé après l'analyse
function summaryText( ana )
{
   var parts = [];
   var merged = [], partial = [];
   for ( var q = 0; q < 3; ++q )
   {
      var D = ana.diag[q];
      if ( D.confused )
         merged.push( LINES[D.a] + "/" + LINES[D.b] + format( " (%.0f°)", Math.abs( D.sep ) ) );
      else if ( D.verdict == "partial" )
         partial.push( LINES[D.a] + "/" + LINES[D.b] + format( " (%.0f°)", Math.abs( D.sep ) ) );
   }
   if ( merged.length > 0 )
      parts.push( L( "Confondues : ", "Merged: " ) + merged.join( ", " ) );
   if ( partial.length > 0 )
      parts.push( L( "En partie séparées : ", "Partly separated: " ) + partial.join( ", " ) );
   if ( merged.length == 0 && partial.length == 0 )
      parts.push( L( "Aucune paire confondue.", "No merged pair." ) );
   var undef = [];
   for ( var i = 0; i < 3; ++i )
      if ( !ana.famOk[i] )
         undef.push( LINES[i] );
   if ( undef.length > 0 )
      parts.push( L( "Couleur indéterminée (zones blanches ou grises ?) : ", "Undefined colour (white or grey areas?): " ) + undef.join( ", " ) +
                  L( " : raie laissée inactive.", ": line left inactive." ) );
   var integ = [];
   for ( var i = 0; i < 3; ++i )
      if ( ana.quality[i].fmt.length > 0 && ana.quality[i].fmt.charAt( 0 ) == "u" )
         integ.push( LINES[i] + " (" + ana.quality[i].fmt + ")" );
   if ( integ.length > 0 )
      parts.push( L( "Master en entiers, précision réduite (préférer 32 bits flottant) : ", "Integer master, reduced precision (prefer 32-bit float): " ) + integ.join( ", " ) );
   return parts.join( " | " );
}

// ============================================================================
// Proposition et préréglages
// ============================================================================

function proposedTolerance( ana, i )
{
   var paired = ana.inPair && ana.inPair[i] >= 0;
   var tol = clamp( Math.round( ana.famSpread[i] + 15 ), paired ? 60 : 45, 120 );
   for ( var k = 0; k < 3; ++k )
   {
      var dist = Math.abs( wrapDeg( ana.fam[k] - ana.fam[i] ) );
      if ( k != i && dist > 5 && ana.famOk[k] )
         tol = Math.min( tol, Math.max( 30, Math.round( 0.8 * dist ) ) );
   }
   return tol;
}

// Proposition : cibles sur les couleurs actuelles, puis séparation des paires confondues
// ou en partie séparées jusqu'à 2 x split. Pour SII/Ha (ordre SHO), le Ha ne dépasse pas l'or.
function propose( p, ana )
{
   for ( var i = 0; i < 3; ++i )
   {
      p[T_KEYS[i]] = Math.round( ana.fam[i] );
      p[F_KEYS[i]] = 0;
      p[W_KEYS[i]] = proposedTolerance( ana, i );
      p[SAT_KEYS[i]] = 1;
   }
   p.tight = 0;
   p.mixed = 0;
   var order = ORDERS[p.order] || "SHO";
   for ( var q = 0; q < 3; ++q )
   {
      var D = ana.diag[q];
      if ( D.verdict != "merged" && D.verdict != "partial" )
         continue;
      if ( !ana.famOk[D.a] || !ana.famOk[D.b] )
         continue;
      var ra = order.indexOf( LETTER[D.a] ), rb = order.indexOf( LETTER[D.b] );
      var lo = ra < rb ? D.a : D.b, hi = ra < rb ? D.b : D.a;   // lo : canal le plus rouge -> vers le rouge
      var center = D.confused ? D.h0 : wrap360( ana.fam[lo] + 0.5 * wrapDeg( ana.fam[hi] - ana.fam[lo] ) );
      var tLo = wrap360( center - p.split ), tHi = wrap360( center + p.split );
      // Ha : pas au-delà de l'or (jaune-vert à l'écran) ; l'écart est reporté sur l'autre raie
      if ( hi == 1 && wrapDeg( tHi - HA_GOLD_MAX ) > 0 && wrapDeg( tHi - HA_GOLD_MAX ) < 90 )
      {
         tHi = HA_GOLD_MAX;
         tLo = wrap360( tHi - 2 * p.split );
      }
      p[T_KEYS[lo]] = Math.round( tLo );
      p[T_KEYS[hi]] = Math.round( tHi );
      p[F_KEYS[lo]] = 1;
      p[F_KEYS[hi]] = 1;
   }
   p.preset = PRESET_PROPOSAL;
}

function presetName( idx )
{
   var e = PRESETS[idx] || PRESETS[0];
   return L( e[0], e[1] );
}

// Applique un préréglage (sans effet pour Personnalisée ; Proposition exige une analyse).
function applyPreset( p, idx, ana )
{
   p.preset = idx;
   if ( idx == PRESET_PROPOSAL )
   {
      if ( ana != null )
         propose( p, ana );
      return;
   }
   var e = PRESETS[idx];
   if ( !e || isNaN( e[2] ) )
      return;
   for ( var i = 0; i < 3; ++i )
   {
      p[T_KEYS[i]] = e[2 + i];
      p[F_KEYS[i]] = ( ana != null && !ana.famOk[i] ) ? 0 : 1;
      p[SAT_KEYS[i]] = e[5];
      p[W_KEYS[i]] = 180;     // palette : toute la famille tourne (comme la passe 3 de la 1.1)
   }
   p.tight = e[6];
   p.mixed = e[7];
}

// ============================================================================
// 2. Moteur de couleur
// ============================================================================

// Appartenance d'un pixel aux familles (somme <= 1) : dominance des proportions
// (exposant sharpFam) ; une paire confondue compte comme un groupe, partagé entre ses
// deux raies selon le caractère (exposant sharpPair : contraste de la séparation).
function familyWeights( p0, p1, p2, c0, c1, c2, sg, P, w )
{
   var pr = [ p0, p1, p2 ], ch = [ c0, c1, c2 ];
   w[0] = w[1] = w[2] = 0;
   var e = P.sharpFam;
   if ( P.pairA >= 0 )
   {
      var a = P.pairA, b = P.pairB, o = 3 - a - b;
      var gp = Math.pow( pr[a] + pr[b], e ), go = Math.pow( pr[o], e ), t = gp + go;
      if ( t <= 1e-12 )
         return;
      var u = clamp( ( ch[a] - ch[b] ) / Math.max( sg, 0.05 ), -1, 1 );
      // zones mixtes (rapport habituel, u = 0) : inchangées (mixed = 0) ou partagées à parts égales (mixed = 1)
      var sa = clamp( 0.5 + 0.5 * P.sharpPair * u, 0, 1 );
      var ea = clamp( P.sharpPair * u, 0, 1 ), eb = clamp( -P.sharpPair * u, 0, 1 );
      w[a] = gp / t * ( P.mixed * sa + ( 1 - P.mixed ) * ea );
      w[b] = gp / t * ( P.mixed * ( 1 - sa ) + ( 1 - P.mixed ) * eb );
      w[o] = go / t;
   }
   else
   {
      var g0 = Math.pow( p0, e ), g1 = Math.pow( p1, e ), g2 = Math.pow( p2, e ), t = g0 + g1 + g2;
      if ( t <= 1e-12 )
         return;
      w[0] = g0 / t;
      w[1] = g1 / t;
      w[2] = g2 / t;
   }
}

// Paramètres du moteur pour un jeu de réglages : cibles, centres mesurés des familles.
function mixParams( p, ana )
{
   var P = [];
   for ( var i = 0; i < 3; ++i )
      P.push( {
         force: clamp( p[F_KEYS[i]], 0, 1 ),
         sat: p[SAT_KEYS[i]],
         tol: Math.max( 1, p[W_KEYS[i]] ),
         phiT: ycAngleOfHue( p[T_KEYS[i]] ),
         famDeg: ana.fam[i],
         c: ycAngleOfHue( ana.fam[i] ),
         on: false
      } );
   P.sharpFam = p.sharpFam;
   P.sharpPair = p.sharpPair;
   P.tight = clamp( p.tight, 0, 1 );
   P.mixed = clamp( p.mixed, 0, 1 );
   P.pairA = -1;
   P.pairB = -1;
   for ( var pass = 0; pass < 2 && P.pairA < 0; ++pass )
      for ( var q = 0; q < 3; ++q )
         if ( ( pass == 0 ? ana.diag[q].confused : ana.diag[q].pairable ) && P.pairA < 0 )
         {
            P.pairA = ana.diag[q].a;
            P.pairB = ana.diag[q].b;
         }
   P.w = [ 0, 0, 0 ];
   for ( var i = 0; i < 3; ++i )
      P[i].on = P[i].force > 0 || P[i].sat != 1;
   P.any = P[0].on || P[1].on || P[2].on;

   // Centre de chaque famille dans le plan (Cb, Cr) : moyenne circulaire sur un échantillon,
   // pondérée par appartenance x signal x chrominance (sert au resserrement)
   var n = ana.ww * ana.wh, step = Math.max( 1, Math.floor( n / 60000 ) );
   var sx = [ 0, 0, 0 ], sy = [ 0, 0, 0 ], sw = [ 0, 0, 0 ], w = [ 0, 0, 0 ];
   for ( var j = 0; j < n; j += step )
   {
      var sg = ana.sig[j];
      if ( sg < 0.05 )
         continue;
      var r = ana.fr[j], g = ana.fg[j], b = ana.fb[j];
      var Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      var Cb = ( b - Y ) / 1.8556, Cr = ( r - Y ) / 1.5748, m = Math.sqrt( Cb * Cb + Cr * Cr );
      if ( m < 1e-4 )
         continue;
      familyWeights( ana.pr[0][j], ana.pr[1][j], ana.pr[2][j], ana.ch[0][j], ana.ch[1][j], ana.ch[2][j], sg, P, w );
      for ( var i = 0; i < 3; ++i )
      {
         var k = w[i] * sg * m;
         sx[i] += k * Cb / m;
         sy[i] += k * Cr / m;
         sw[i] += k;
      }
   }
   for ( var i = 0; i < 3; ++i )
      if ( sw[i] > 1e-9 && ana.famOk[i] )
         P[i].c = Math.atan2( sy[i], sx[i] );
   return P;
}

// Calcule la nouvelle couleur d'un pixel. out = [r, g, b]. Retourne true si modifié.
// ch0..2 : caractère ; ys/cbs/crs : couleur lissée (tolérance) ; sg : signal ; p0..2 : proportions.
function mixPixel( r, g, b, c0, c1, c2, ys, cbs, crs, P, out, st, sg, p0, p1, p2 )
{
   out[0] = r; out[1] = g; out[2] = b;
   if ( !P.any || !( sg > 1e-4 ) )
      return false;
   var Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
   var Cb = ( b - Y ) / 1.8556, Cr = ( r - Y ) / 1.5748;
   var m = Math.sqrt( Cb * Cb + Cr * Cr );
   if ( m < 1e-7 )
      return false;
   // teinte de la couleur lissée (pour la tolérance)
   var rs = ys + 1.5748 * crs, bs = ys + 1.8556 * cbs, gs = ( ys - 0.2126 * rs - 0.0722 * bs ) / 0.7152;
   var hs = hueDeg( rs, gs, bs );
   if ( hs < 0 )
      return false;
   var w = P.w;
   familyWeights( p0, p1, p2, c0, c1, c2, sg, P, w );
   var phi = Math.atan2( Cr, Cb ), theta = 0, satf = 1, ks = Math.min( 1, sg ), any = false;
   for ( var i = 0; i < 3; ++i )
   {
      var Li = P[i];
      if ( !Li.on || w[i] <= 0 )
         continue;
      var close = Li.tol >= 180 ? 1 : 1 - smooth01( Math.abs( wrapDeg( hs - Li.famDeg ) ) / Li.tol );
      if ( close <= 0 )
         continue;
      var a = w[i] * close * ks;
      if ( Li.force > 0 )
      {
         // rotation de la famille : (cible - centre), moins le resserrement de l'écart du pixel au centre
         var dC = wrapRad( phi - Li.c );
         var dRot = wrapRad( Li.phiT - Li.c ) - P.tight * dC;
         if ( P.tight > 0 )
         {
            // palette (resserrement > 0) : comme la passe 3 de la 1.1, la famille est centrée sur la
            // cible et garde (1 - resserrement) de ses écarts DES DEUX CÔTÉS, sans butée à la cible
            // (avec butée, le côté situé entre le centre et la cible s'écrase sur la cible et la
            // famille glisse d'un côté : OIII plus bleu qu'en 1.1). Effet effacé au-delà de 120°
            // du centre, comme en 1.1 (à 180° le sens de rotation serait indéterminé).
            var ad = Math.abs( dC );
            if ( ad > 2 * Math.PI / 3 )
            {
               var t3 = ( Math.PI - ad ) / ( Math.PI / 3 );
               dRot *= t3 * t3 * ( 3 - 2 * t3 );
            }
         }
         else
         {
            // proposition (sans resserrement) : un pixel ne dépasse jamais la cible
            // (et ne bouge pas s'il est déjà au-delà)
            var toT = wrapRad( Li.phiT - phi );
            if ( dRot * toT <= 0 )
               dRot = 0;
            else if ( Math.abs( dRot ) > Math.abs( toT ) )
               dRot = toT;
         }
         theta += Li.force * a * dRot;
      }
      satf += a * ( Li.sat - 1 );
      if ( st && a * ( Li.force > 0 ? 1 : Math.abs( Li.sat - 1 ) ) > 0.02 )
         ++st[i];
      any = true;
   }
   if ( !any )
      return false;
   if ( satf < 0 )
      satf = 0;
   if ( Math.abs( theta ) < 1e-6 && Math.abs( satf - 1 ) < 1e-6 )
      return false;
   var m2 = m * satf, ph = phi + theta;
   var Cb2 = m2 * Math.cos( ph ), Cr2 = m2 * Math.sin( ph );
   var dR = 1.5748 * Cr2, dB = 1.8556 * Cb2, dG = -( 0.2126 * dR + 0.0722 * dB ) / 0.7152;
   // Garde-fou : saturation réduite juste assez pour rester affichable
   // plafond par canal : 0,99, ou sa valeur d'origine si elle était déjà plus haute
   var f = 1;
   var dd = [ dR, dG, dB ], cap = [ Math.max( 0.99, r ), Math.max( 0.99, g ), Math.max( 0.99, b ) ];
   for ( var k = 0; k < 3; ++k )
   {
      var x = dd[k];
      if ( x > 1e-9 )
         f = Math.min( f, ( cap[k] - Y ) / x );
      else if ( x < -1e-9 )
         f = Math.min( f, Y / -x );
   }
   if ( f < 0 )
      f = 0;
   out[0] = clamp( Y + f * dR, 0, 1 );
   out[1] = clamp( Y + f * dG, 0, 1 );
   out[2] = clamp( Y + f * dB, 0, 1 );
   return true;
}

// Mélange sur l'image de travail (aperçu). Retourne une Image RVB 32 bits.
function previewImage( p, ana, before, st )
{
   var ww = ana.ww, wh = ana.wh;
   var img = new Image( ww, wh, 3, ColorSpace.RGB, 32, PixelSampleType.Float );
   var Or = new ImageIterator( img, 0 ), Og = new ImageIterator( img, 1 ), Ob = new ImageIterator( img, 2 );
   var P = mixParams( p, ana ), out = [ 0, 0, 0 ];
   for ( var y = 0; y < wh; ++y )
   {
      var rr = Or[y], rg = Og[y], rb = Ob[y];
      for ( var x = 0; x < ww; ++x )
      {
         var j = y * ww + x;
         if ( before )
         {
            out[0] = ana.fr[j]; out[1] = ana.fg[j]; out[2] = ana.fb[j];
         }
         else
            mixPixel( ana.fr[j], ana.fg[j], ana.fb[j], ana.ch[0][j], ana.ch[1][j], ana.ch[2][j],
                      ana.ys[j], ana.cb[j], ana.cr[j], P, out, st, ana.sig[j], ana.pr[0][j], ana.pr[1][j], ana.pr[2][j] );
         rr[x] = out[0]; rg[x] = out[1]; rb[x] = out[2];
      }
   }
   return img;
}

// Image des familles : rouge = SII, vert = Ha, bleu = OIII (appartenance x signal).
function showLineMap( p, ana )
{
   var ww = ana.ww, wh = ana.wh, n = ww * wh;
   var P = mixParams( p, ana ), w = [ 0, 0, 0 ];
   var maps = [ new Float32Array( n ), new Float32Array( n ), new Float32Array( n ) ];
   for ( var j = 0; j < n; ++j )
   {
      var sg = ana.sig[j];
      if ( !( sg > 1e-4 ) )
         continue;
      familyWeights( ana.pr[0][j], ana.pr[1][j], ana.pr[2][j], ana.ch[0][j], ana.ch[1][j], ana.ch[2][j], sg, P, w );
      var k = Math.min( 1, sg );
      for ( var i = 0; i < 3; ++i )
         maps[i][j] = clamp( w[i] * k, 0, 1 );
   }
   var img = new Image( ww, wh, 3, ColorSpace.RGB, 32, PixelSampleType.Float );
   for ( var c = 0; c < 3; ++c )
   {
      var I = new ImageIterator( img, c ), src = maps[c];
      for ( var y = 0; y < wh; ++y )
      {
         var row = I[y];
         for ( var x = 0; x < ww; ++x )
            row[x] = src[y * ww + x];
      }
   }
   var win = new ImageWindow( ww, wh, 3, 32, true, true, validId( "B238_familles" ) );
   win.mainView.beginProcess( UndoFlag.NoSwapFile );
   win.mainView.image.assign( img );
   win.mainView.endProcess();
   img.free();
   win.show();
   win.zoomToFit();
}

function bilin( map, ww, wh, x0, x1, tx, y0, y1, ty )
{
   var a = map[y0 * ww + x0], b = map[y0 * ww + x1], c = map[y1 * ww + x0], d = map[y1 * ww + x1];
   return ( a * ( 1 - tx ) + b * tx ) * ( 1 - ty ) + ( c * ( 1 - tx ) + d * tx ) * ty;
}

// Application en pleine résolution : crée <id>_mix.
function applyFull( p )
{
   var t0 = Date.now();
   console.show();
   var v = checkInputs( p );
   if ( ANA == null || ANA.key != analysisKey( p ) )
      analyse( p );
   var ana = ANA, s = ana.s, ww = ana.ww, wh = ana.wh, W = ana.W, H = ana.H;
   log( "<b>" + TITLE + L( " : application en pleine résolution</b>", ": full-resolution apply</b>" ) );
   var P = mixParams( p, ana ), out = [ 0, 0, 0 ];
   var src = floatCopy( v.T, validId( "B238_tmp" ) );
   var res = new Image( W, H, 3, ColorSpace.RGB, 32, PixelSampleType.Float );
   var nChanged = 0, nNewClip = 0, maxDY = 0;
   try
   {
      var Ir = new ImageIterator( src.image, 0 ), Ig = new ImageIterator( src.image, 1 ), Ib = new ImageIterator( src.image, 2 );
      var Or = new ImageIterator( res, 0 ), Og = new ImageIterator( res, 1 ), Ob = new ImageIterator( res, 2 );
      var maps = [ ana.ch[0], ana.ch[1], ana.ch[2], ana.ys, ana.cb, ana.cr, ana.sig, ana.pr[0], ana.pr[1], ana.pr[2] ], mv = new Float64Array( 10 );
      for ( var y = 0; y < H; ++y )
      {
         var fy = clamp( ( y + 0.5 ) / s - 0.5, 0, wh - 1 ), y0 = Math.floor( fy ), y1 = Math.min( y0 + 1, wh - 1 ), ty = fy - y0;
         var sr = Ir[y], sg = Ig[y], sb = Ib[y], rr = Or[y], rg = Og[y], rb = Ob[y];
         for ( var x = 0; x < W; ++x )
         {
            var fx = clamp( ( x + 0.5 ) / s - 0.5, 0, ww - 1 ), x0 = Math.floor( fx ), x1 = Math.min( x0 + 1, ww - 1 ), tx = fx - x0;
            var r = sr[x], g = sg[x], b = sb[x];
            mv[6] = P.any ? bilin( maps[6], ww, wh, x0, x1, tx, y0, y1, ty ) : 0;
            if ( mv[6] <= 1e-4 )
            {
               rr[x] = r; rg[x] = g; rb[x] = b;
               continue;
            }
            for ( var k = 0; k < 10; ++k )
               if ( k != 6 )
                  mv[k] = bilin( maps[k], ww, wh, x0, x1, tx, y0, y1, ty );
            if ( mixPixel( r, g, b, mv[0], mv[1], mv[2], mv[3], mv[4], mv[5], P, out, null, mv[6], mv[7], mv[8], mv[9] ) )
            {
               ++nChanged;
               var dY = Math.abs( 0.2126 * ( out[0] - r ) + 0.7152 * ( out[1] - g ) + 0.0722 * ( out[2] - b ) );
               if ( dY > maxDY ) maxDY = dY;
               if ( ( out[0] >= 0.999 && r < 0.999 ) || ( out[1] >= 0.999 && g < 0.999 ) || ( out[2] >= 0.999 && b < 0.999 ) )
                  ++nNewClip;
            }
            rr[x] = out[0]; rg[x] = out[1]; rb[x] = out[2];
         }
         if ( y % 1000 == 0 && y > 0 )
         {
            console.writeln( format( "  %d %%", Math.round( 100 * y / H ) ) );
            CoreApplication.processEvents();
         }
      }
      console.writeln( "  100 %" );
   }
   finally
   {
      closeView( src );
   }
   var id = validId( v.T.id + "_mix" );
   var win = new ImageWindow( W, H, 3, 32, true, true, id );
   win.mainView.beginProcess( UndoFlag.NoSwapFile );
   win.mainView.image.assign( res );
   win.mainView.endProcess();
   res.free();

   log( L( "<b>Réglages</b> : ", "<b>Settings</b>: " ) + presetName( p.preset ) +
        format( L( " | zones mixtes %.2f | resserrement %.2f | image montée en %s", " | mixed areas %.2f | tightening %.2f | image built as %s" ), p.mixed, p.tight, ORDERS[p.order] ) );
   for ( var i = 0; i < 3; ++i )
      log( format( L( "  %-4s couleur actuelle %s -> cible %3.0f° | force %.2f | tolérance %.0f° | saturation %.2f",
                      "  %-4s current colour %s -> target %3.0f° | strength %.2f | tolerance %.0f° | saturation %.2f" ),
           LINES[i], ana.famOk[i] ? format( "%3.0f°", ana.fam[i] ) : L( "indét.", "undef." ),
           p[T_KEYS[i]], p[F_KEYS[i]], p[W_KEYS[i]], p[SAT_KEYS[i]] ) );
   log( format( L( "  Pixels dont la couleur a bougé : %.1f %% | écart de luminance maximal : %.5f | nouveaux pixels écrêtés : %d",
                   "  Pixels whose colour changed: %.1f %% | maximum luminance difference: %.5f | newly clipped pixels: %d" ),
        100 * nChanged / ( W * H ), maxDY, nNewClip ) );
   log( format( L( "Résultat : <b>%s</b> (%.1f s)", "Result: <b>%s</b> (%.1f s)" ), id, ( Date.now() - t0 ) / 1000 ) );
   win.show();
   win.zoomToFit();
   return win.mainView;
}

// ============================================================================
// Infobulles
// ============================================================================

function buildTips()
{
   if ( LANG == "fr" )
      return {
   s: "<p><b>SII linéaire sans étoiles</b> (niveaux de gris), telle quelle, non étirée.</p>" +
      "<p>Sert <b>uniquement à repérer où le SII domine</b> (zones de recouvrement des raies). Ce n'est pas " +
      "l'image dont on change les couleurs, et elle n'est jamais modifiée. En 32 bits flottant de préférence.</p>",
   h: "<p><b>Ha linéaire sans étoiles</b> (niveaux de gris), telle quelle. Sert uniquement à repérer où le Ha domine. Non modifiée.</p>",
   o: "<p><b>OIII linéaire sans étoiles</b> (niveaux de gris), telle quelle. Sert uniquement à repérer où l'OIII domine. Non modifiée.</p>",
   t: "<p><b>Image finale étirée</b> (RVB, sans étoiles de préférence) : c'est elle dont on change les couleurs. " +
      "Elle n'est pas modifiée : le résultat est une copie &lt;id&gt;_mix.</p><p>Elle doit être alignée pixel à " +
      "pixel avec les trois couches (pas de recadrage ni de rotation entre les deux).</p>",
   order: "<p><b>Ordre des raies dans l'image finale</b> : quelle raie est dans le rouge, le vert, le bleu " +
      "(SHO : SII rouge, Ha vert, OIII bleu). Sert seulement à la proposition, pour le sens de séparation d'une " +
      "paire : la raie du canal le plus rouge part vers le rouge, l'autre vers l'or.</p>",
   analyse: "<p><b>Analyser.</b> Lit les quatre images (copies), mesure pour chaque paire de raies si leur " +
      "rapport change la couleur de l'image finale, mesure la couleur actuelle de chaque raie, puis applique " +
      "la proposition (ou le préréglage choisi). À relancer après un changement d'image.</p>",
   map: "<p><b>Familles</b> : ouvre une image des familles de couleur : rouge = SII, vert = Ha, bleu = OIII, " +
      "noir = fond (rien ne bouge). Une paire confondue est partagée entre ses deux raies là où l'une est " +
      "plus forte que d'habitude.</p>",
   diag: "<p><b>Diagnostic des paires.</b> Partage : part du signal où les deux raies sont présentes. Rapport : " +
      "comment leur rapport varie (10e et 90e centiles). Écart : différence de teinte que ce rapport produit " +
      "dans l'image finale. <b>Confondues</b> : le rapport varie mais la couleur ne suit pas (bichromie).</p>",
   preset: "<p><b>Préréglage</b>. <b>Proposition</b> : cibles sur les couleurs actuelles, et séparation des " +
      "paires confondues ou en partie séparées. Les autres remplissent les cibles d'une palette ; " +
      "<b>Vraies couleurs</b> : teintes calculées depuis les longueurs d'onde (SII et Ha donnent le même rouge, " +
      "OIII un vert-turquoise) ; <b>Cuivre et sarcelle</b> : filaments cuivre, cœurs ambre, OIII turquoise, " +
      "couleurs franches. <b>Personnalisée</b> : tes propres cibles (automatique dès qu'on en modifie une).</p>",
   mixed: "<p><b>Zones mixtes</b> d'une paire de raies (SII/Ha en général) : là où les deux raies sont dans " +
      "leur rapport habituel. 0 = elles gardent leur couleur, seules les zones où une raie est plus forte que " +
      "d'habitude vont vers sa cible (séparation subtile, comme la proposition) ; 1 = elles prennent la couleur " +
      "à mi-chemin des deux cibles (toute la paire est recolorée, comme avec une palette).</p>",
   tight: "<p><b>Resserrement des teintes</b> : réduit les variations de teinte à l'intérieur d'une famille " +
      "(0 = conservées, 1 = toute la famille prend exactement la teinte de la cible). Dès qu'il est au-dessus de 0, " +
      "la famille est centrée sur la cible et garde le reste de ses écarts des deux côtés (palettes : 0,5, la " +
      "moitié). À 0, un pixel ne dépasse jamais sa cible : effet visible surtout sur une famille large (OIII).</p>",
   target: "<p><b>Couleur cible</b> (teinte en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, 180 cyan, " +
      "240 bleu, 300 magenta). La pastille montre la couleur. La laisser sur la couleur actuelle ne change rien " +
      "(sauf resserrement).</p>",
   force: "<p><b>Force</b> : 0 = raie inactive, 1 = les zones de cette raie vont jusqu'à la cible, entre les " +
      "deux = en partie. Sans resserrement, un pixel ne dépasse jamais sa cible ; avec un resserrement (palettes), " +
      "la famille se répartit des deux côtés de la cible.</p>",
   tol: "<p><b>Tolérance</b> (degrés) : un filtre sur la couleur actuelle. Le script sait par les masters quels pixels " +
      "appartiennent à une raie ; la tolérance dit en plus lesquels ont le droit de bouger selon leur couleur. Seuls les pixels dont " +
      "la couleur lissée est à moins de cette distance de la couleur actuelle de la raie sont concernés, avec " +
      "un effet qui s'atténue avec la distance. C'est ce qui protège les zones d'une autre couleur. " +
      "180 = sans limite : toute la famille bouge (réglage des palettes).</p>",
   sat: "<p><b>Saturation</b> de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus " +
      "franche, 0,8 = plus douce. La luminosité ne change pas.</p>",
   fine: "<p><b>Curseur fin</b> : zoom autour de la valeur du curseur du dessus, pour un réglage précis. Il se " +
      "recentre quand on relâche la souris ou quand la valeur change ailleurs.</p>",
   lang: "<p>Langue de l'interface. Le dialogue se rouvre aussitôt dans la langue choisie, en gardant l'analyse " +
      "et les réglages. Le choix est mémorisé.</p><p>Interface language. The dialog reopens in the chosen " +
      "language, keeping the analysis and settings.</p>",
   blurLines: "<p><b>Lissage des raies</b> (StdDev en pixels pleine résolution) avant de comparer leurs rapports, " +
      "pour que le bruit ne décide pas.</p>",
   blurMap: "<p><b>Lissage des cartes</b> (px) : douceur des transitions entre zones de raies différentes.</p>",
   blurColor: "<p><b>Lissage couleur</b> (px) : la tolérance est jugée sur la couleur lissée, pas pixel par pixel.</p>",
   sigPct: "<p><b>Seuil de signal</b> : centile du signal total au-dessus duquel l'effet est complet. En dessous, " +
      "l'effet décroît jusqu'à zéro sur le fond.</p>",
   split: "<p><b>Écart proposé</b> (degrés) : la proposition écarte chaque raie d'une paire confondue de cette " +
      "valeur de part et d'autre de leur couleur commune (le Ha n'est pas poussé au-delà de 48°, l'or).</p>",
   sharpPair: "<p><b>Contraste de séparation</b> d'une paire confondue : 1 = partage doux selon le caractère, " +
      "2 = une zone où une raie est nettement plus forte que d'habitude appartient entièrement à cette raie.</p>",
   sharpFam: "<p><b>Netteté des familles</b> : exposant sur les proportions des raies. Plus il est grand, plus " +
      "un pixel appartient à la raie qui domine, et moins les mélanges sont partagés.</p>",
   bg: "<p><b>Fond de ciel de chaque couche linéaire</b>. Auto = pic de l'histogramme 16 bits. " +
      "<b>Réglage sensible</b> : les signaux comparés sont de l'ordre de 0,00001.</p>",
   weights: "<p><b>Mise à niveau</b> de SII et OIII sur Ha. Auto = médiane de Ha / médiane de la couche, dans " +
      "les 30 % de pixels où Ha est le plus fort.</p>",
   auto: "<p>Calculé automatiquement à l'analyse. Décocher pour entrer une valeur à la main.</p>",
   advanced: "<p>Réglages de l'analyse. Ils sont calculés automatiquement et changent rarement.</p>",
   refresh: "<p>Refait l'analyse si un réglage avancé a changé, puis l'aperçu.</p>",
   before: "<p>Montre l'image finale sans modification, pour comparer.</p>",
   fitB: "<p>Aperçu entier dans la fenêtre. Molette : zoom ; glisser : déplacer.</p>",
   oneB: "<p>Aperçu à 100 % de l'image de travail (réduite, environ 1 800 pixels de large).</p>",
   apply: "<p><b>Appliquer</b> : crée l'image &lt;id&gt;_mix en pleine résolution. L'original n'est pas modifié. " +
      "La console donne les réglages, le nombre de pixels modifiés, l'écart de luminance maximal et le nombre " +
      "de nouveaux pixels écrêtés.</p>",
   close: "<p>Ferme en mémorisant les réglages pour la prochaine fois.</p>",
   reset: "<p><b>Réinitialiser</b> : remet tous les réglages aux valeurs par défaut (en gardant les quatre " +
      "images), puis réapplique la proposition.</p>",
   newInstance: "<p>Glisser sur le bureau pour créer une icône de process avec tous les réglages et le nom des " +
      "quatre images. Double-clic : rouvre ce dialogue avec ces réglages. Glisser sur une image : l'applique.</p>"
      };
   return {
   s: "<p><b>Linear starless SII</b> (grayscale), as is, not stretched.</p>" +
      "<p>It is <b>only used to locate where SII dominates</b> (zones where the lines overlap). It is not the " +
      "image whose colours change, and it is never modified. 32-bit float preferred.</p>",
   h: "<p><b>Linear starless Ha</b> (grayscale), as is. Only used to locate where Ha dominates. Never modified.</p>",
   o: "<p><b>Linear starless OIII</b> (grayscale), as is. Only used to locate where OIII dominates. Never modified.</p>",
   t: "<p><b>Final stretched image</b> (RGB, preferably starless): this is the image whose colours are changed. " +
      "It is not modified: the result is a copy &lt;id&gt;_mix.</p><p>It must be pixel-aligned with the three " +
      "masters (no crop or rotation between them).</p>",
   order: "<p><b>Order of the lines in the final image</b>: which line is in red, green and blue (SHO: SII " +
      "red, Ha green, OIII blue). Only used by the proposal, for the direction of the split of a pair: the line " +
      "in the reddest channel goes toward red, the other toward gold.</p>",
   analyse: "<p><b>Analyse.</b> Reads the four images (copies), measures for each pair of lines whether their " +
      "ratio changes the colour of the final image, measures the current colour of each line, then applies " +
      "the proposal (or the chosen preset). Run it again after changing an image.</p>",
   map: "<p><b>Families</b>: opens an image of the colour families: red = SII, green = Ha, blue = OIII, " +
      "black = background (nothing moves). A merged pair is shared between its two lines where one is " +
      "stronger than usual.</p>",
   diag: "<p><b>Pair diagnosis.</b> Share: part of the signal where both lines are present. Ratio: how their " +
      "ratio varies (10th and 90th percentiles). Hue diff.: hue difference that this ratio produces in the " +
      "final image. <b>Merged</b>: the ratio varies but the colour does not follow (two-colour look).</p>",
   preset: "<p><b>Preset</b>. <b>Proposal</b>: targets on the current colours, and a split of the merged or " +
      "partly separated pairs. The others fill the targets with a palette; <b>True colours</b>: hues computed " +
      "from the emission wavelengths (SII and Ha give the same red, OIII a green-teal); <b>Copper and teal</b>: " +
      "copper filaments, amber cores, teal OIII, bold colours. <b>Custom</b>: your own targets (automatic as soon as you edit one).</p>",
   mixed: "<p><b>Mixed areas</b> of a pair of lines (usually SII/Ha): where both lines are at their usual " +
      "ratio. 0 = they keep their colour, only the areas where one line is stronger than usual move toward " +
      "its target (subtle split, as in the proposal); 1 = they take the colour halfway between the two " +
      "targets (the whole pair is recoloured, as with a palette).</p>",
   tight: "<p><b>Hue tightening</b>: reduces the hue variations inside a family (0 = kept, 1 = the whole " +
      "family takes exactly the target hue). Above 0, the family is centred on the target and keeps the rest of " +
      "its spread on both sides (palettes: 0.5, half of it). At 0, a pixel never goes past its target: the " +
      "effect shows mostly on a wide family (OIII).</p>",
   target: "<p><b>Target colour</b> (hue in degrees: 0 red, 30 orange, 50 gold, 60 yellow, 120 green, 180 cyan, " +
      "240 blue, 300 magenta). The swatch shows the colour. Leaving it on the current colour changes nothing " +
      "(except tightening).</p>",
   force: "<p><b>Strength</b>: 0 = line inactive, 1 = the areas of this line go all the way to the target, in " +
      "between = part of the way. Without tightening, a pixel never goes past the target; with tightening " +
      "(palettes), the family spreads on both sides of the target.</p>",
   tol: "<p><b>Tolerance</b> (degrees): a filter on the current colour. The masters tell the script which pixels " +
      "belong to a line; the tolerance also says which of them may move, according to their colour. Only pixels whose smoothed " +
      "colour is within this distance of the line's current colour are affected, with an effect that fades " +
      "with distance. This is what protects areas of another colour. 180 = no limit: the whole family " +
      "moves (palette setting).</p>",
   sat: "<p><b>Saturation</b> of the colour in the areas of this line: 1 = unchanged, 1.3 = 30 % stronger, " +
      "0.8 = softer. Luminance does not change.</p>",
   fine: "<p><b>Fine slider</b>: a zoom around the value of the slider above, for precise adjustment. It " +
      "re-centres when you release the mouse or when the value changes elsewhere.</p>",
   lang: "<p>Interface language. The dialog reopens right away in the chosen language, keeping the analysis " +
      "and settings. The choice is remembered.</p><p>Langue de l'interface. Le dialogue se rouvre dans la " +
      "langue choisie, en gardant l'analyse et les réglages.</p>",
   blurLines: "<p><b>Line smoothing</b> (StdDev in full-resolution pixels) before comparing line ratios, so " +
      "that noise does not decide.</p>",
   blurMap: "<p><b>Map smoothing</b> (px): softness of the transitions between areas of different lines.</p>",
   blurColor: "<p><b>Colour smoothing</b> (px): the tolerance is judged on the smoothed colour, not pixel by pixel.</p>",
   sigPct: "<p><b>Signal threshold</b>: percentile of the total signal above which the effect is complete. " +
      "Below it, the effect fades to zero on the background.</p>",
   split: "<p><b>Proposed split</b> (degrees): the proposal moves each line of a merged pair this far on either " +
      "side of their common colour (Ha is not pushed beyond 48°, gold).</p>",
   sharpPair: "<p><b>Split contrast</b> of a merged pair: 1 = soft sharing according to the character, 2 = an " +
      "area where one line is clearly stronger than usual belongs entirely to that line.</p>",
   sharpFam: "<p><b>Family sharpness</b>: exponent on the line proportions. The larger it is, the more a pixel " +
      "belongs to the dominant line, and the less the mixtures are shared.</p>",
   bg: "<p><b>Sky background of each linear master</b>. Auto = peak of the 16-bit histogram. " +
      "<b>Sensitive setting</b>: the compared signals are of the order of 0.00001.</p>",
   weights: "<p><b>Levelling</b> of SII and OIII to Ha. Auto = median of Ha / median of the master, in the 30 % " +
      "of pixels where Ha is strongest.</p>",
   auto: "<p>Computed automatically by the analysis. Untick to enter a value by hand.</p>",
   advanced: "<p>Analysis settings. They are computed automatically and rarely need changing.</p>",
   refresh: "<p>Runs the analysis again if an advanced setting changed, then the preview.</p>",
   before: "<p>Shows the final image unchanged, for comparison.</p>",
   fitB: "<p>Whole preview in the window. Wheel: zoom; drag: pan.</p>",
   oneB: "<p>Preview at 100 % of the working image (reduced, about 1,800 pixels wide).</p>",
   apply: "<p><b>Apply</b>: creates the image &lt;id&gt;_mix at full resolution. The original is not modified. " +
      "The console reports the settings, the number of changed pixels, the maximum luminance difference and " +
      "the number of newly clipped pixels.</p>",
   close: "<p>Closes and remembers the settings for next time.</p>",
   reset: "<p><b>Reset</b>: puts every setting back to its default (keeping the four images), then applies " +
      "the proposal again.</p>",
   newInstance: "<p>Drag to the workspace to create a process icon with all settings and the names of the " +
      "four images. Double-click: reopens this dialog with these settings. Drag onto an image: applies.</p>"
   };
}

// ============================================================================
// Aperçu (zone défilante avec zoom)
// ============================================================================

var PreviewBox = class extends ScrollBox {
constructor( parent )
{
   super( parent );
   this.bitmap = null;
   this.zoom = 1;
   this.fit = true;
   this.dragging = false;
   this.dx0 = 0; this.dy0 = 0; this.sx0 = 0; this.sy0 = 0;
   this.autoScroll = true;
   this.tracking = true;
   var self = this;

   this.onHorizontalScrollPosUpdated = function() { this.viewport.update(); };
   this.onVerticalScrollPosUpdated = function() { this.viewport.update(); };
   this.viewport.onResize = function()
   {
      if ( self.fit ) self.zoomFit(); else self.updateRange();
   };
   this.viewport.onMousePress = function( x, y )
   {
      self.dragging = true;
      self.dx0 = x; self.dy0 = y;
      self.sx0 = self.horizontalScrollPosition;
      self.sy0 = self.verticalScrollPosition;
   };
   this.viewport.onMouseRelease = function() { self.dragging = false; };
   this.viewport.onMouseMove = function( x, y )
   {
      if ( self.dragging )
      {
         self.horizontalScrollPosition = self.sx0 + ( self.dx0 - x );
         self.verticalScrollPosition = self.sy0 + ( self.dy0 - y );
      }
   };
   this.viewport.onMouseWheel = function( x, y, delta )
   {
      var z = delta > 0 ? Math.min( self.zoom * 1.25, 8 ) : Math.max( self.zoom * 0.8, 0.05 );
      self.fit = false;
      self.zoomAt( z, x, y );
   };
   this.viewport.onPaint = function( x0, y0, x1, y1 )
   {
      var g = new Graphics( this );
      g.fillRect( x0, y0, x1, y1, new Brush( 0xff181818 ) );
      if ( self.bitmap )
      {
         var bw = Math.round( self.bitmap.width * self.zoom ), bh = Math.round( self.bitmap.height * self.zoom );
         var ox = ( self.maxHorizontalScrollPosition > 0 ) ? -self.horizontalScrollPosition : Math.floor( ( this.width - bw ) / 2 );
         var oy = ( self.maxVerticalScrollPosition > 0 ) ? -self.verticalScrollPosition : Math.floor( ( this.height - bh ) / 2 );
         g.drawScaledBitmap( new Rect( ox, oy, ox + bw, oy + bh ), self.bitmap );
      }
      g.end();
   };
}

updateRange()
{
   if ( !this.bitmap )
   {
      this.setHorizontalScrollRange( 0, 0 );
      this.setVerticalScrollRange( 0, 0 );
   }
   else
   {
      var bw = Math.round( this.bitmap.width * this.zoom ), bh = Math.round( this.bitmap.height * this.zoom );
      this.setHorizontalScrollRange( 0, Math.max( 0, bw - this.viewport.width ) );
      this.setVerticalScrollRange( 0, Math.max( 0, bh - this.viewport.height ) );
   }
   this.viewport.update();
}

zoomAt( z, vx, vy )
{
   var ratio = z / this.zoom;
   this.zoom = z;
   this.updateRange();
   this.horizontalScrollPosition = Math.max( 0, ( this.horizontalScrollPosition + vx ) * ratio - vx );
   this.verticalScrollPosition = Math.max( 0, ( this.verticalScrollPosition + vy ) * ratio - vy );
}

zoomFit()
{
   this.fit = true;
   if ( !this.bitmap )
      return this.updateRange();
   this.zoom = Math.max( 0.05, Math.min( this.viewport.width / this.bitmap.width, this.viewport.height / this.bitmap.height ) );
   this.horizontalScrollPosition = 0;
   this.verticalScrollPosition = 0;
   this.updateRange();
}

zoomOne()
{
   this.fit = false;
   this.zoom = 1;
   this.updateRange();
}

setBitmap( bmp )
{
   this.bitmap = bmp;
   if ( this.fit ) this.zoomFit(); else this.updateRange();
}
};

// ============================================================================
// Dialogue
// ============================================================================

var STARTUP_NOTICE = "";   // réglages restaurés non standard (liste), vidée par Réinitialiser

function noticeText()
{
   return L( "<b>Réglages de la dernière session restaurés</b> (" + STARTUP_NOTICE + "). Le bouton Réinitialiser remet les valeurs par défaut.",
             "<b>Settings restored from the last session</b> (" + STARTUP_NOTICE + "). The Reset button restores the defaults." );
}

var MixDialog = class extends Dialog {
constructor()
{
   super();
   var self = this;
   this.windowTitle = TITLE + " " + VERSION;
   this.relaunch = false;
   var labelWidth = this.font.width( L( "Lissage des raies (px) :", "Line smoothing (px):" ) ) + 10;
   var autoWidth = this.font.width( "Auto" ) + 32;

   // --- utilitaires de construction -------------------------------------
   this.numeric = {};
   this.numRange = {};
   this.fine = {};
   this.checks = {};

   this.makeCheck = function( text, key, tip, onChange )
   {
      var cb = new CheckBox( self );
      cb.text = text;
      cb.checked = TP[key];
      cb.toolTip = tip;
      cb.onCheck = function( checked )
      {
         TP[key] = checked;
         if ( onChange ) onChange();
      };
      self.checks[key] = cb;
      return cb;
   };

   this.makeNumeric = function( text, key, min, max, prec, tip, onChange, lw )
   {
      var nc = new NumericControl( self );
      nc.label.text = text;
      nc.label.minWidth = lw ? lw : labelWidth;
      nc.setReal( true );
      nc.setRange( min, max );
      nc.setPrecision( prec );
      nc.slider.setRange( 0, 1000 );
      nc.setValue( TP[key] );
      nc.toolTip = tip;
      nc.onValueUpdated = function( value )
      {
         TP[key] = value;
         if ( self.fine[key] && !self.fine[key].busy )
            self.fine[key].recenter();
         if ( onChange ) onChange( key );
      };
      self.numeric[key] = nc;
      self.numRange[key] = [ min, max ];
      return nc;
   };

   // Curseur fin : zoom de ± span autour de la valeur du curseur principal.
   this.makeFine = function( key, span, prec, onChange, lw )
   {
      var steps = 400;
      var lab = new Label( self );
      lab.text = L( "fin ±", "fine ±" ) + ( span < 1 ? format( "%.2f", span ) : format( "%.0f", span ) );
      lab.minWidth = lw ? lw : labelWidth;
      lab.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      lab.toolTip = TIPS.fine;
      var sl = new Slider( self );
      sl.setRange( 0, steps );
      sl.value = steps / 2;
      sl.toolTip = TIPS.fine;
      var F = { center: TP[key], busy: false, slider: sl };
      F.recenter = function()
      {
         F.center = TP[key];
         F.busy = true;
         sl.value = steps / 2;
         F.busy = false;
      };
      sl.onValueUpdated = function( v )
      {
         if ( F.busy )
            return;
         var rg = self.numRange[key], q = Math.pow( 10, prec );
         var val = clamp( F.center + ( v - steps / 2 ) / ( steps / 2 ) * span, rg[0], rg[1] );
         val = Math.round( val * q ) / q;
         TP[key] = val;
         F.busy = true;
         self.numeric[key].setValue( val );
         F.busy = false;
         if ( onChange ) onChange( key );
      };
      sl.onMouseRelease = function() { F.recenter(); };
      self.fine[key] = F;
      var r = new HorizontalSizer;
      r.spacing = 4;
      r.add( lab );
      r.add( sl, 100 );
      return r;
   };

   this.row = function( control, autoKey, tipAuto )
   {
      var r = new HorizontalSizer;
      r.spacing = 6;
      r.add( control, 100 );
      if ( autoKey )
      {
         var cb = self.makeCheck( "Auto", autoKey, tipAuto ? tipAuto : TIPS.auto, function() { self.updateEnabled(); self.markStale(); } );
         cb.minWidth = autoWidth;
         r.add( cb );
      }
      return r;
   };

   var stale = function() { self.markStale(); };
   // modification d'une cible / force / tolérance / saturation : préréglage Personnalisée
   var edit = function( key )
   {
      if ( TP.preset != PRESET_CUSTOM )
      {
         TP.preset = PRESET_CUSTOM;
         self.presetCombo.currentItem = PRESET_CUSTOM;
         self.updateHint();
      }
      self.updateSwatches();
      self.schedulePreview();
   };
   var live = function() { self.schedulePreview(); };

   // --- 1. Images -----------------------------------------------------------
   this.makeViewRow = function( text, key, tip )
   {
      var lab = new Label( self );
      lab.text = text;
      lab.minWidth = labelWidth;
      lab.maxWidth = labelWidth;
      lab.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
      lab.toolTip = tip;
      var vl = new ViewList( self );
      vl.getMainViews();
      vl.toolTip = tip;
      var cur = findView( TP[key] );
      if ( cur != null )
         vl.currentView = cur;
      vl.onViewSelected = function( view )
      {
         TP[key] = ( view == null || view.isNull ) ? "" : view.id;
         self.markStale();
      };
      var r = new HorizontalSizer;
      r.spacing = 4;
      r.add( lab );
      r.add( vl, 100 );
      return { sizer: r, list: vl };
   };

   if ( findView( TP.tId ) == null )
   {
      var aw = ImageWindow.activeWindow;
      if ( aw != null && !aw.isNull && aw.mainView.image.isColor )
         TP.tId = aw.mainView.id;
   }
   this.rowS = this.makeViewRow( L( "SII linéaire :", "Linear SII:" ), "sId", TIPS.s );
   this.rowH = this.makeViewRow( L( "Ha linéaire :", "Linear Ha:" ), "hId", TIPS.h );
   this.rowO = this.makeViewRow( L( "OIII linéaire :", "Linear OIII:" ), "oId", TIPS.o );
   this.rowT = this.makeViewRow( L( "Image finale :", "Final image:" ), "tId", TIPS.t );

   this.viewsGroup = new GroupBox( this );
   this.viewsGroup.title = L( "1. Images", "1. Images" );
   this.viewsGroup.sizer = new VerticalSizer;
   this.viewsGroup.sizer.margin = 6;
   this.viewsGroup.sizer.spacing = 4;
   this.viewsGroup.sizer.add( this.rowS.sizer );
   this.viewsGroup.sizer.add( this.rowH.sizer );
   this.viewsGroup.sizer.add( this.rowO.sizer );
   this.viewsGroup.sizer.add( this.rowT.sizer );

   // --- 2. Analyse ------------------------------------------------------------
   this.analyseButton = new PushButton( this );
   this.analyseButton.text = L( "Analyser", "Analyse" );
   this.analyseButton.toolTip = TIPS.analyse;
   this.analyseButton.onClick = function() { self.runAnalysis(); };

   this.mapButton = new PushButton( this );
   this.mapButton.text = L( "Familles", "Families" );
   this.mapButton.toolTip = TIPS.map;
   this.mapButton.onClick = function()
   {
      if ( !self.ensureAnalysis() ) return;
      try
      {
         showLineMap( TP, ANA );
      }
      catch ( e )
      {
         reportError( L( "familles", "families" ), e );
         self.statusLabel.text = L( "<b>Erreur :</b> ", "<b>Error:</b> " ) + errText( e );
      }
   };

   var aRow = new HorizontalSizer;
   aRow.spacing = 6;
   aRow.add( this.analyseButton );
   aRow.add( this.mapButton );
   aRow.addStretch();

   this.diagLabel = new Label( this );
   this.diagLabel.useRichText = true;
   this.diagLabel.wordWrapping = true;
   this.diagLabel.toolTip = TIPS.diag;
   this.diagLabel.text = L( "<p><i>Pas encore d'analyse.</i></p>", "<p><i>No analysis yet.</i></p>" );

   this.summaryLabel = new Label( this );
   this.summaryLabel.useRichText = true;
   this.summaryLabel.wordWrapping = true;
   this.summaryLabel.text = "";

   this.analyseGroup = new GroupBox( this );
   this.analyseGroup.title = L( "2. Analyse des raies", "2. Line analysis" );
   this.analyseGroup.sizer = new VerticalSizer;
   this.analyseGroup.sizer.margin = 6;
   this.analyseGroup.sizer.spacing = 6;
   this.analyseGroup.sizer.add( aRow );
   this.analyseGroup.sizer.add( this.diagLabel );
   this.analyseGroup.sizer.add( this.summaryLabel );

   // --- 3. Couleurs (préréglage, resserrement) -------------------------------------
   this.presetLabel = new Label( this );
   this.presetLabel.text = L( "Préréglage :", "Preset:" );
   this.presetLabel.minWidth = labelWidth;
   this.presetLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.presetLabel.toolTip = TIPS.preset;
   this.presetCombo = new ComboBox( this );
   for ( var i = 0; i < PRESETS.length; ++i )
      this.presetCombo.addItem( presetName( i ) );
   this.presetCombo.currentItem = TP.preset;
   this.presetCombo.toolTip = TIPS.preset;
   this.presetCombo.onItemSelected = function( idx )
   {
      if ( idx == PRESET_PROPOSAL && ANA == null )
      {
         if ( !self.ensureAnalysis() )
            return;
      }
      applyPreset( TP, idx, ANA );
      self.refreshFromTP();
      self.schedulePreview();
   };
   var presetRow = new HorizontalSizer;
   presetRow.spacing = 4;
   presetRow.add( this.presetLabel );
   presetRow.add( this.presetCombo, 100 );

   this.colourGroup = new GroupBox( this );
   this.colourGroup.title = L( "3. Couleurs", "3. Colours" );
   this.colourGroup.sizer = new VerticalSizer;
   this.colourGroup.sizer.margin = 6;
   this.colourGroup.sizer.spacing = 4;
   this.colourGroup.sizer.add( presetRow );
   this.colourGroup.sizer.add( this.makeNumeric( L( "Zones mixtes :", "Mixed areas:" ), "mixed", 0, 1, 2, TIPS.mixed, edit ) );
   this.colourHint = new Label( this );
   this.colourHint.useRichText = true;
   this.colourHint.wordWrapping = true;
   this.updateHint = function()
   {
      var t;
      if ( TP.preset == PRESET_PROPOSAL )
         t = L( "<i>Proposition : tolérance mesurée sur l'image. Seuls les pixels dont la couleur est proche de celle " +
                "de leur raie bougent ; les autres sont protégés.</i>",
                "<i>Proposal: tolerance measured on the image. Only pixels whose colour is close to their line's colour " +
                "move; the others are protected.</i>" );
      else if ( TP.preset == PRESET_CUSTOM )
         t = L( "<i>Personnalisée : tes cibles. Tolérance : plus elle est basse, plus les zones de couleur différente " +
                "sont protégées (180 = sans limite).</i>",
                "<i>Custom: your targets. Tolerance: the lower it is, the more areas of a different colour are " +
                "protected (180 = no limit).</i>" );
      else
         t = L( "<i>Palette : tolérance à 180° (sans limite), toute la famille de chaque raie prend la couleur de la " +
                "palette. Baisser la tolérance d'une raie garde la couleur d'origine des zones qui s'écartent de sa " +
                "couleur : rendu plus nuancé.</i>",
                "<i>Palette: tolerance at 180° (no limit), the whole family of each line takes the palette colour. " +
                "Lowering a line's tolerance keeps the original colour of the areas that differ from its colour: " +
                "more nuanced result.</i>" );
      self.colourHint.text = t + L( " <i>Réglages de chaque raie : sous l'aperçu.</i>", " <i>Per-line settings: below the preview.</i>" );
   };
   this.colourHint.text = "";
   this.colourGroup.sizer.add( this.colourHint );

   // --- Avancé ----------------------------------------------------------------
   this.advCheck = this.makeCheck( L( "Réglages avancés", "Advanced settings" ), "showAdvanced", TIPS.advanced, function()
   {
      if ( TP.showAdvanced ) self.advGroup.show(); else self.advGroup.hide();
      self.adjustToContents();
   } );
   this.orderLabel = new Label( this );
   this.orderLabel.text = L( "Image finale montée en :", "Final image built as:" );
   this.orderLabel.minWidth = labelWidth;
   this.orderLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.orderLabel.toolTip = TIPS.order;
   this.orderCombo = new ComboBox( this );
   for ( var i = 0; i < ORDERS.length; ++i )
      this.orderCombo.addItem( ORDERS[i] );
   this.orderCombo.currentItem = TP.order;
   this.orderCombo.toolTip = TIPS.order;
   this.orderCombo.onItemSelected = function( idx ) { TP.order = idx; };
   var orderRow = new HorizontalSizer;
   orderRow.spacing = 4;
   orderRow.add( this.orderLabel );
   orderRow.add( this.orderCombo );
   orderRow.addStretch();

   this.advGroup = new GroupBox( this );
   this.advGroup.title = L( "Réglages avancés", "Advanced settings" );
   this.advGroup.sizer = new VerticalSizer;
   this.advGroup.sizer.margin = 6;
   this.advGroup.sizer.spacing = 4;
   this.advGroup.sizer.add( orderRow );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Écart proposé (°) :", "Proposed split (°):" ), "split", 0, 90, 0, TIPS.split ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Contraste séparation :", "Split contrast:" ), "sharpPair", 0.5, 4, 1, TIPS.sharpPair, live ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Netteté des familles :", "Family sharpness:" ), "sharpFam", 1, 6, 1, TIPS.sharpFam, live ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Resserrement (palettes) :", "Tightening (palettes):" ), "tight", 0, 1, 2, TIPS.tight, edit ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage des raies (px) :", "Line smoothing (px):" ), "blurLines", 0, 60, 1, TIPS.blurLines, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage des cartes (px) :", "Map smoothing (px):" ), "blurMap", 0, 40, 1, TIPS.blurMap, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage couleur (px) :", "Colour smoothing (px):" ), "blurColor", 0, 20, 1, TIPS.blurColor, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Seuil de signal :", "Signal threshold:" ), "sigPct", 5, 95, 0, TIPS.sigPct, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond SII :", "SII background:" ), "bgS", 0, 1, 6, TIPS.bg, stale ), "autoBg" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond Ha :", "Ha background:" ), "bgH", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond OIII :", "OIII background:" ), "bgO", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Poids SII :", "SII weight:" ), "kS", 0.01, 100, 3, TIPS.weights, stale ), "autoWeights" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Poids OIII :", "OIII weight:" ), "kO", 0.01, 100, 3, TIPS.weights, stale ) ) );

   // --- Colonne de gauche --------------------------------------------------------
   this.helpLabel = new Label( this );
   this.helpLabel.useRichText = true;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.text = L(
      "<p><b>" + TITLE + " " + VERSION + "</b> : donne à chaque raie sa couleur. Seule la teinte change, " +
      "la luminosité reste celle de ton image. Les trois couches linéaires servent seulement à repérer où " +
      "chaque raie domine ; c'est l'image finale étirée qui change de couleur.</p>" +
      "<p><i>1. Choisir les quatre images, 2. Analyser, 3. ajuster les couleurs avec l'aperçu (ou choisir une " +
      "palette), puis Appliquer. Passer la souris sur un réglage pour son explication.</i></p>",
      "<p><b>" + TITLE + " " + VERSION + "</b> gives each emission line its own colour. Only the hue changes; " +
      "the brightness of your image is kept. The three linear masters are only used to locate where each line " +
      "dominates; the colours are changed on the final stretched image.</p>" +
      "<p><i>1. Select the four images, 2. Analyse, 3. adjust the colours with the preview (or pick a palette), " +
      "then Apply. Hover over any setting for an explanation.</i></p>" );

   this.langLabel = new Label( this );
   this.langLabel.text = "Langue / Language :";
   this.langLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   this.langLabel.toolTip = TIPS.lang;
   this.langCombo = new ComboBox( this );
   this.langCombo.addItem( "English" );
   this.langCombo.addItem( "Français" );
   this.langCombo.currentItem = LANG == "fr" ? 1 : 0;
   this.langCombo.toolTip = TIPS.lang;
   this.langCombo.onItemSelected = function( idx )
   {
      var nl = idx == 1 ? "fr" : "en";
      if ( nl == LANG )
         return;
      saveLanguage( nl );
      LANG = nl;
      saveSettings();
      self.relaunch = true;
      self.timer.stop();
      self.stopBlink();
      self.ok();
   };
   var langRow = new HorizontalSizer;
   langRow.spacing = 4;
   langRow.addStretch();
   langRow.add( this.langLabel );
   langRow.add( this.langCombo );

   this.leftColumn = new Control( this );
   this.leftColumn.sizer = new VerticalSizer;
   this.leftColumn.sizer.spacing = 6;
   // Avertissement "réglages restaurés" : rouge-orangé, clignote quelques secondes à l'ouverture
   this.noticeLabel = new Label( this );
   this.noticeLabel.useRichText = true;
   this.noticeLabel.wordWrapping = true;
   this.noticeStyles = [ "QLabel { color: #d13a0c; font-weight: bold; }", "QLabel { color: #7a2a10; font-weight: bold; }" ];
   this.noticeLabel.styleSheet = this.noticeStyles[0];
   this.noticeLabel.text = STARTUP_NOTICE.length > 0 ? noticeText() : "";
   this.blinkCount = 0;
   this.blinkTimer = new Timer;
   this.blinkTimer.periodic = true;
   this.blinkTimer.interval = 0.5;
   this.blinkTimer.onTimeout = function()
   {
      ++self.blinkCount;
      self.noticeLabel.styleSheet = self.noticeStyles[self.blinkCount % 2];
      if ( self.blinkCount >= 16 )      // 8 s, puis reste allumé
      {
         self.blinkTimer.stop();
         self.noticeLabel.styleSheet = self.noticeStyles[0];
      }
   };
   this.stopBlink = function()
   {
      try { self.blinkTimer.stop(); } catch ( e ) {}
   };
   if ( STARTUP_NOTICE.length == 0 )
      this.noticeLabel.hide();
   else
      this.blinkTimer.start();

   this.leftColumn.sizer.add( langRow );
   this.leftColumn.sizer.add( this.helpLabel );
   this.leftColumn.sizer.add( this.noticeLabel );
   this.leftColumn.sizer.add( this.viewsGroup );
   this.leftColumn.sizer.add( this.analyseGroup );
   this.leftColumn.sizer.add( this.colourGroup );
   this.leftColumn.sizer.add( this.advCheck );
   this.leftColumn.sizer.add( this.advGroup );
   this.leftColumn.sizer.addStretch();
   this.leftColumn.setMinWidth( this.logicalPixelsToPhysical( 430 ) );

   // --- Raies (sous l'aperçu) ------------------------------------------------------------
   this.swatch = [];
   this.famLabel = [];
   this.lineGroups = [];
   var lw2 = this.font.width( L( "Tolérance (°) :", "Tolerance (°):" ) ) + 10;
   for ( var i = 0; i < 3; ++i )
   {
      var grp = new GroupBox( this );
      grp.title = LINES[i];
      grp.sizer = new VerticalSizer;
      grp.sizer.margin = 6;
      grp.sizer.spacing = 4;
      var sw = new Label( this );
      sw.setFixedSize( 36, 18 );
      sw.toolTip = TIPS.target;
      this.swatch.push( sw );
      var fl = new Label( this );
      fl.text = L( "couleur actuelle : ?", "current colour: ?" );
      fl.textAlignment = TextAlignment.Left | TextAlignment.VertCenter;
      this.famLabel.push( fl );
      var top = new HorizontalSizer;
      top.spacing = 6;
      top.add( sw );
      top.add( fl, 100 );
      grp.sizer.add( top );
      grp.sizer.add( this.makeNumeric( L( "Cible (°) :", "Target (°):" ), T_KEYS[i], 0, 360, 1, TIPS.target, edit, lw2 ) );
      grp.sizer.add( this.makeFine( T_KEYS[i], 15, 1, edit, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Force :", "Strength:" ), F_KEYS[i], 0, 1, 2, TIPS.force, edit, lw2 ) );
      grp.sizer.add( this.makeFine( F_KEYS[i], 0.1, 2, edit, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Tolérance (°) :", "Tolerance (°):" ), W_KEYS[i], 5, 180, 0, TIPS.tol, edit, lw2 ) );
      grp.sizer.add( this.makeFine( W_KEYS[i], 10, 0, edit, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Saturation :", "Saturation:" ), SAT_KEYS[i], 0.5, 2, 2, TIPS.sat, edit, lw2 ) );
      grp.sizer.add( this.makeFine( SAT_KEYS[i], 0.2, 2, edit, lw2 ) );
      this.lineGroups.push( grp );
   }
   var linesRow = new HorizontalSizer;
   linesRow.spacing = 6;
   for ( var i = 0; i < 3; ++i )
      linesRow.add( this.lineGroups[i], 100 );

   // --- Aperçu ---------------------------------------------------------------------------
   this.previewBox = new PreviewBox( this );
   this.previewBox.setMinSize( this.logicalPixelsToPhysical( 640 ), this.logicalPixelsToPhysical( 420 ) );

   this.fitButton = new PushButton( this );
   this.fitButton.text = L( "Ajuster", "Fit" );
   this.fitButton.toolTip = TIPS.fitB;
   this.fitButton.onClick = function() { self.previewBox.zoomFit(); };
   this.oneButton = new PushButton( this );
   this.oneButton.text = "100 %";
   this.oneButton.toolTip = TIPS.oneB;
   this.oneButton.onClick = function() { self.previewBox.zoomOne(); };
   this.refreshButton = new PushButton( this );
   this.refreshButton.text = L( "Rafraîchir", "Refresh" );
   this.refreshButton.toolTip = TIPS.refresh;
   this.refreshButton.onClick = function()
   {
      if ( self.ensureAnalysis() )
         self.refreshPreview();
   };
   this.beforeCheck = new CheckBox( this );
   this.beforeCheck.text = L( "Avant", "Before" );
   this.beforeCheck.toolTip = TIPS.before;
   this.beforeCheck.onCheck = function() { self.refreshPreview(); };
   this.statusLabel = new Label( this );
   this.statusLabel.text = "";
   this.statusLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
   var pRow = new HorizontalSizer;
   pRow.spacing = 6;
   pRow.add( this.refreshButton );
   pRow.add( this.fitButton );
   pRow.add( this.oneButton );
   pRow.add( this.beforeCheck );
   pRow.addStretch();
   pRow.add( this.statusLabel );

   this.rightColumn = new Control( this );
   this.rightColumn.sizer = new VerticalSizer;
   this.rightColumn.sizer.spacing = 6;
   this.rightColumn.sizer.add( pRow );
   this.rightColumn.sizer.add( this.previewBox, 100 );
   this.rightColumn.sizer.add( linesRow );

   var mainRow = new HorizontalSizer;
   mainRow.spacing = 8;
   mainRow.add( this.leftColumn );
   mainRow.add( this.rightColumn, 100 );

   // --- Boutons --------------------------------------------------------------------------
   this.newInstanceButton = new ToolButton( this );
   this.newInstanceButton.icon = this.scaledResource( ":/process-interface/new-instance.png" );
   this.newInstanceButton.setScaledFixedSize( 20, 20 );
   this.newInstanceButton.toolTip = TIPS.newInstance;
   this.newInstanceButton.onMousePress = function()
   {
      this.hasFocus = true;
      saveParameters();
      this.pushed = false;
      this.dialog.newInstance();
   };

   this.resetButton = new PushButton( this );
   this.resetButton.text = L( "Réinitialiser", "Reset" );
   this.resetButton.icon = this.scaledResource( ":/process-interface/reset.png" );
   this.resetButton.toolTip = TIPS.reset;
   this.resetButton.onClick = function()
   {
      var ids = { sId: TP.sId, hId: TP.hId, oId: TP.oId, tId: TP.tId };
      resetTP();
      for ( var key in ids )
         TP[key] = ids[key];
      if ( ANA != null )
         propose( TP, ANA );
      STARTUP_NOTICE = "";
      self.stopBlink();
      self.noticeLabel.hide();
      self.refreshFromTP();
      self.statusLabel.text = L( "Réglages remis aux valeurs par défaut", "Settings reset to defaults" );
      self.schedulePreview();
   };

   this.applyButton = new PushButton( this );
   this.applyButton.text = L( "Appliquer", "Apply" );
   this.applyButton.icon = this.scaledResource( ":/icons/ok.png" );
   this.applyButton.toolTip = TIPS.apply;
   this.applyButton.onClick = function()
   {
      self.applyButton.enabled = false;
      try
      {
         applyFull( TP );
         saveSettings();
         self.refreshFromTP();
      }
      catch ( e )
      {
         reportError( L( "application", "apply" ), e );
         self.statusLabel.text = L( "<b>Erreur :</b> ", "<b>Error:</b> " ) + errText( e );
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
      }
      self.applyButton.enabled = true;
   };

   this.closeButton = new PushButton( this );
   this.closeButton.text = L( "Fermer", "Close" );
   this.closeButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.closeButton.toolTip = TIPS.close;
   this.closeButton.onClick = function()
   {
      self.timer.stop();
      self.stopBlink();
      saveSettings();
      self.ok();
   };

   var bRow = new HorizontalSizer;
   bRow.spacing = 6;
   bRow.add( this.newInstanceButton );
   bRow.addStretch();
   bRow.add( this.resetButton );
   bRow.add( this.applyButton );
   bRow.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( mainRow, 100 );
   this.sizer.add( bRow );

   // --- Comportement ---------------------------------------------------------------------
   this.timer = new Timer;
   this.timer.periodic = false;
   this.timer.interval = 0.25;
   this.timer.onTimeout = function() { self.refreshPreview(); };

   this.ensureAnalysis = function()
   {
      if ( ANA != null && ANA.key == analysisKey( TP ) )
         return true;
      self.runAnalysis();
      return ANA != null && ANA.key == analysisKey( TP );
   };

   this.schedulePreview = function()
   {
      if ( ANA == null )
      {
         self.statusLabel.text = L( "<i>Pas encore d'analyse : clique sur Analyser</i>", "<i>No analysis yet: click Analyse</i>" );
         return;
      }
      if ( ANA.key != analysisKey( TP ) )
      {
         self.statusLabel.text = L( "<i>Analyse à refaire : clique sur Rafraîchir</i>", "<i>Analysis out of date: click Refresh</i>" );
         return;
      }
      self.timer.stop();
      self.timer.start();
   };

   this.markStale = function()
   {
      if ( ANA != null && ANA.key != analysisKey( TP ) )
         self.statusLabel.text = L( "<i>Analyse à refaire : clique sur Rafraîchir</i>", "<i>Analysis out of date: click Refresh</i>" );
   };

   this.updateSwatches = function()
   {
      for ( var i = 0; i < 3; ++i )
         self.swatch[i].styleSheet = "QLabel { background-color: " + hexOfHue( TP[T_KEYS[i]] ) +
                                     "; border: 1px solid #777777; }";
   };

   this.updateEnabled = function()
   {
      var a = !TP.autoBg, b = !TP.autoWeights;
      self.numeric.bgS.enabled = a;
      self.numeric.bgH.enabled = a;
      self.numeric.bgO.enabled = a;
      self.numeric.kS.enabled = b;
      self.numeric.kO.enabled = b;
   };

   this.updateDiag = function()
   {
      if ( ANA == null )
         return;
      var t = "<table cellspacing='4'><tr><th align='left'>" + L( "Paire", "Pair" ) + "</th><th>" + L( "Partage", "Share" ) +
              "</th><th>" + L( "Rapport", "Ratio" ) + "</th><th>" + L( "Écart", "Hue diff." ) + "</th><th align='left'>" +
              L( "Verdict", "Verdict" ) + "</th></tr>";
      for ( var q = 0; q < 3; ++q )
      {
         var D = ANA.diag[q];
         var name = LINES[D.a] + "/" + LINES[D.b];
         if ( D.p10 === undefined )
            t += "<tr><td>" + name + "</td><td colspan='4'>" + verdictText( D ) + "</td></tr>";
         else
            t += "<tr><td>" + name + "</td><td align='right'>" + format( "%.0f %%", D.overlap ) +
                 "</td><td align='right'>" + format( "%+.2f / %+.2f", D.p10, D.p90 ) +
                 "</td><td align='right'>" + format( "%.0f°", Math.abs( D.sep ) ) + "</td><td>" +
                 ( D.confused ? "<b>" + verdictText( D ) + "</b>" : verdictText( D ) ) + "</td></tr>";
      }
      t += "</table>";
      self.diagLabel.text = t;
      self.summaryLabel.text = "<p>" + summaryText( ANA ) + "</p>";
      for ( var i = 0; i < 3; ++i )
         self.famLabel[i].text = ANA.famOk[i] ? format( L( "couleur actuelle : %.0f°", "current colour: %.0f°" ), ANA.fam[i] )
                                              : L( "couleur actuelle : indéterminée", "current colour: undefined" );
   };

   this.refreshFromTP = function()
   {
      for ( var key in self.numeric )
         self.numeric[key].setValue( TP[key] );
      for ( var key in self.fine )
         self.fine[key].recenter();
      self.presetCombo.currentItem = TP.preset;
      self.updateHint();
      for ( var key in self.checks )
         self.checks[key].checked = TP[key];
      self.orderCombo.currentItem = TP.order;
      var pairs = [ [ self.rowS, "sId" ], [ self.rowH, "hId" ], [ self.rowO, "oId" ], [ self.rowT, "tId" ] ];
      for ( var i = 0; i < pairs.length; ++i )
      {
         var v = findView( TP[pairs[i][1]] );
         if ( v != null )
            pairs[i][0].list.currentView = v;
      }
      self.updateSwatches();
      self.updateEnabled();
      self.updateDiag();
   };

   this.runAnalysis = function()
   {
      self.analyseButton.enabled = false;
      self.statusLabel.text = L( "<b>Analyse en cours...</b> (10 à 30 s, voir la console)", "<b>Analysing...</b> (10 to 30 s, see the console)" );
      CoreApplication.processEvents();
      var t0 = Date.now(), ok = false;
      try
      {
         console.show();
         var prevIds = ANA != null ? ANA.ids : TP.lastIds;
         ANA = null;
         analyse( TP );
         TP.lastIds = ANA.ids;
         // cibles personnalisées : gardées sur les mêmes images, sinon retour à la proposition
         if ( TP.preset == PRESET_CUSTOM && prevIds != ANA.ids )
            TP.preset = PRESET_PROPOSAL;
         if ( !( TP.preset == PRESET_CUSTOM ) )
            applyPreset( TP, TP.preset, ANA );
         self.beforeBitmap = null;
         self.refreshFromTP();
         ok = true;
      }
      catch ( e )
      {
         ANA = null;
         reportError( L( "analyse", "analysis" ), e );
         self.statusLabel.text = L( "<b>Erreur d'analyse :</b> ", "<b>Analysis error:</b> " ) + errText( e );
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
      }
      self.analyseButton.enabled = true;
      self.updateEnabled();
      if ( ok )
      {
         self.statusLabel.text = format( L( "Analyse faite en %.1f s", "Analysis done in %.1f s" ), ( Date.now() - t0 ) / 1000 );
         self.refreshPreview();
      }
   };

   this.beforeBitmap = null;
   this.refreshPreview = function()
   {
      if ( ANA == null )
      {
         self.statusLabel.text = L( "<i>Pas encore d'analyse : clique sur Analyser</i>", "<i>No analysis yet: click Analyse</i>" );
         return;
      }
      var t0 = Date.now();
      try
      {
         var bmp;
         if ( self.beforeCheck.checked )
         {
            if ( self.beforeBitmap == null )
            {
               var ib = previewImage( TP, ANA, true );
               self.beforeBitmap = ib.render();
               ib.free();
            }
            bmp = self.beforeBitmap;
         }
         else
         {
            var st = [ 0, 0, 0 ];
            var im = previewImage( TP, ANA, false, st );
            bmp = im.render();
            im.free();
            var npx = ANA.ww * ANA.wh;
            for ( var i = 0; i < 3; ++i )
            {
               var cur = ANA.famOk[i] ? format( L( "actuelle %.0f° | ", "current %.0f° | " ), ANA.fam[i] )
                                      : L( "indéterminée | ", "undefined | " );
               self.famLabel[i].text = cur +
                  ( ( TP[F_KEYS[i]] <= 0 && TP[SAT_KEYS[i]] == 1 ) ? L( "inactive (force 0)", "inactive (strength 0)" ) :
                    format( L( "agit sur %.1f %% de l'image", "acts on %.1f %% of the image" ), 100 * st[i] / npx ) );
            }
         }
         self.previewBox.setBitmap( bmp );
         var now = new Date();
         self.statusLabel.text = format( L( "Aperçu à jour (%02d:%02d:%02d, %.2f s)", "Preview updated (%02d:%02d:%02d, %.2f s)" ), now.getHours(), now.getMinutes(),
                                         now.getSeconds(), ( Date.now() - t0 ) / 1000 );
      }
      catch ( e )
      {
         reportError( L( "aperçu", "preview" ), e );
         self.statusLabel.text = L( "<b>Erreur d'aperçu :</b> ", "<b>Preview error:</b> " ) + errText( e );
      }
   };

   if ( !TP.showAdvanced )
      this.advGroup.hide();
   this.refreshFromTP();
   if ( STARTUP_NOTICE.length > 0 )
      this.statusLabel.text = noticeText();
   this.adjustToContents();
   this.setMinWidth( this.logicalPixelsToPhysical( 1200 ) );
   this.setMinHeight( this.logicalPixelsToPhysical( 820 ) );
}
};

// ============================================================================
// Point d'entrée
// ============================================================================

function main()
{
   LANG = detectLanguage();
   TIPS = buildTips();
   resetTP();
   if ( Parameters.isViewTarget )
   {
      loadParameters();
      TP.tId = Parameters.targetView.id;
      try
      {
         analyse( TP );
         if ( TP.preset == PRESET_PROPOSAL )
            propose( TP, ANA );
         applyFull( TP );
      }
      catch ( e )
      {
         reportError( L( "icône", "icon" ), e );
      }
      return;
   }
   if ( Parameters.isGlobalTarget )
      loadParameters();
   else
   {
      loadSettings();
      var diff = restoredNotice();
      if ( diff.length > 0 )
      {
         STARTUP_NOTICE = diff.join( ", " );
         log( TITLE + " : " + noticeText().replace( /<[^>]+>/g, "" ) );
      }
   }
   for ( ;; )
   {
      TIPS = buildTips();
      var dialog = new MixDialog;
      dialog.execute();
      if ( !dialog.relaunch )
         break;
   }
   ANA = null;
}

main();
