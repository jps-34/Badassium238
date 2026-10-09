#feature-id    Utilities > Badassium238 PI193
#feature-info  Finds which emission lines (SII, Ha, OIII) end up with the same hue in the \
   final image, then gives each line its own colour by a hue rotation at constant \
   luminance, with preview and optional palette presets. Creates a copy, never modifies \
   the original image. Interface in English or French. \
   Version for PixInsight 1.9.3 and earlier (legacy JavaScript engine).

#include <pjsr/Sizer.jsh>
#include <pjsr/TextAlign.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/NumericControl.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/DataType.jsh>

/*
 * Badassium238_PI193.js  v1.1.0 (version moteur historique, PixInsight 1.9.3)
 * Copyright (c) 2026 Jacques Pouyaud. MIT License (see LICENSE).
 * Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud.
 * https://github.com/jps-34/Badassium238
 * (ex-TrichromieSHO)
 * v1.1.0 : interface anglais / français, curseurs fins, passe 3 (palette).
 * ----------------------------------------------------------------------------
 * Passe 1 (Analyser)
 *   - Les trois couches linéaires sans étoiles sont lues (copies), réduites,
 *     lissées, leur fond retiré, SII et OIII mis au niveau de Ha.
 *   - Pour chaque paire de raies : part du signal partagée, variation du
 *     rapport entre les deux, et écart de teinte que ce rapport produit dans
 *     l'image finale. Une paire dont le rapport varie mais dont la teinte ne
 *     suit pas est "confondue" (bichromie).
 *   - Cartes "caractère" de chaque raie : pour une paire confondue, où la raie
 *     est plus forte que d'habitude par rapport à sa partenaire ; sinon, sa
 *     présence. Pondérées par le signal (rien sur le fond).
 *
 * Passe 2 (aperçu, Appliquer)
 *   Pour chaque pixel de l'image finale, dans le plan de chrominance YCbCr
 *   (Rec. 709) : rotation de la teinte vers la couleur cible de chaque raie,
 *   dosée par force x caractère x tolérance (proximité de la couleur actuelle
 *   avec la famille de la raie), et saturation optionnelle par raie.
 *   La luminance Y = 0,2126 R + 0,7152 V + 0,0722 B est conservée exactement.
 *   Garde-fou : si la nouvelle couleur sort des couleurs affichables, sa
 *   saturation est réduite juste assez ; aucun canal ne dépasse
 *   max(0,99 ; sa valeur d'origine).
 *
 * Passe 3 (palette, cosmétique, facultative)
 *   Chaque famille de couleur issue de la passe 2 (une par raie) est tournée en
 *   bloc vers la teinte d'une palette choisie (préréglages ou personnalisée),
 *   avec une saturation et une intensité réglables. Seules les zones de signal
 *   sont concernées ; la luminance reste conservée exactement.
 *
 * Les trois couches linéaires ne servent qu'à repérer où chaque raie domine
 * (zones de recouvrement) ; c'est l'image finale étirée qui change de couleur.
 *
 * L'image d'origine et les couches ne sont jamais modifiées : le résultat est
 * une nouvelle image <id>_mix.
 *
 * Version pour le moteur JavaScript historique (SpiderMonkey) de PixInsight
 * 1.9.3 et antérieurs : conventions reprises de VeraLux Suite 2.1.0
 * (portage PJSR de killerciao / lucasssvaz) : constantes par #include,
 * dialogues par héritage de fonction, accès aux pixels par lignes.
 * ----------------------------------------------------------------------------
 */


var TITLE   = "Badassium238";
var VERSION = "1.1.0";
var LANG_KEY = "Badassium238/language";
var LANG = "en";

// Langue : choix memorise, sinon langue du systeme (variables d'environnement,
// puis Intl), sinon anglais. PixInsight lui-meme n'est pas localise.
function detectLanguage()
{
   try
   {
      var saved = Settings.read( LANG_KEY, DataType_String );
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
   try
   {
      Settings.write( LANG_KEY, DataType_String, lang );
   }
   catch ( e ) {}
}

function L( fr, en )
{
   return LANG == "fr" ? fr : en;
}
var SETTINGS_KEY = "Badassium238_193/settings";
var OLD_SETTINGS_KEY = "TrichromieSHO193/settings";
var LINES = [ "SII", "Ha", "OIII" ];
var PALETTES = [ "SHO", "SOH", "HSO", "HOS", "OSH", "OHS" ];
var LETTER = [ "S", "H", "O" ];

// Passe 3 : préréglages de palette. [ nom fr, nom en, SII, Ha, OIII, saturation ]
// "Vraies couleurs" : teintes calculées depuis les longueurs d'onde (CIE 1931 vers sRGB) :
// SII 672,4 nm et Ha 656,3 nm donnent le même rouge (355°), OIII 500,7 nm un vert-turquoise (160°).
var P3_PRESETS = [
   [ "Aucune (garder la séparation)", "None (keep the separation)", NaN, NaN, NaN, 1 ],
   [ "SII rouge, Ha or, OIII bleu", "SII red, Ha gold, OIII blue", 5, 45, 225, 1 ],
   [ "Ha rouge, SII or, OIII bleu", "Ha red, SII gold, OIII blue", 45, 0, 225, 1 ],
   [ "Vraies couleurs (longueurs d'onde)", "True colours (wavelengths)", 355, 355, 160, 1 ],
   [ "Naturel rouge / turquoise", "Natural red / teal", 345, 355, 185, 0.85 ],
   [ "Minéral (doux)", "Mineral (soft)", 20, 38, 205, 0.55 ],
   [ "Personnalisée", "Custom", NaN, NaN, NaN, NaN ]
];
var P3_CUSTOM = P3_PRESETS.length - 1;
var P3_KEYS = [ "p3S", "p3H", "p3O" ];

var T_KEYS   = [ "tS", "tH", "tO" ];
var F_KEYS   = [ "fS", "fH", "fO" ];
var W_KEYS   = [ "wS", "wH", "wO" ];
var SAT_KEYS = [ "satS", "satH", "satO" ];

var DEFAULTS = {
   sId: "", hId: "", oId: "", tId: "",
   palette: 0,
   blurLines: 20, blurMap: 10, blurColor: 5, split: 25, sigPct: 60,
   autoBg: true,      bgS: 0.145022, bgH: 0.145022, bgO: 0.145022,
   autoWeights: true, kS: 2.46, kO: 6.06,
   tS: 22, tH: 22, tO: 296,
   fS: 0, fH: 0, fO: 0,
   wS: 60, wH: 60, wO: 45,
   satS: 1, satH: 1, satO: 1,
   targetsSet: false,
   showAdvanced: false,
   p3Preset: 0, p3S: 5, p3H: 45, p3O: 225, p3Sat: 1, p3Amt: 1
};

var STR_KEYS  = [ "sId", "hId", "oId", "tId" ];
var BOOL_KEYS = [ "autoBg", "autoWeights", "targetsSet", "showAdvanced" ];
var REAL_KEYS = [ "palette", "blurLines", "blurMap", "blurColor", "split", "sigPct",
                  "bgS", "bgH", "bgO", "kS", "kO", "p3Preset", "p3Sat", "p3Amt" ].concat( T_KEYS, F_KEYS, W_KEYS, SAT_KEYS, P3_KEYS );

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
}

function saveSettings()
{
   try
   {
      Settings.write( SETTINGS_KEY, DataType_String, JSON.stringify( TP ) );
   }
   catch ( e ) {}
}

function loadSettings()
{
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType_String );
      if ( s == null || s.length == 0 )
      {
         // réglages mémorisés sous l'ancien nom (TrichromieSHO)
         try { s = Settings.read( OLD_SETTINGS_KEY, DataType_String ); } catch ( e2 ) { s = null; }
      }
      if ( s != null && s.length > 0 )
      {
         var o = JSON.parse( s );
         for ( var key in DEFAULTS )
            if ( o[key] !== undefined && typeof o[key] === typeof DEFAULTS[key] )
               TP[key] = o[key];
      }
   }
   catch ( e ) {}
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

function enumVal( cls, name )
{
   if ( cls[name] !== undefined )
      return cls[name];
   return cls.prototype[name];
}

function pumpEvents()
{
   try
   {
      processEvents();
   }
   catch ( e ) {}
}

function freeImage( img )
{
   try
   {
      if ( img && img.free )
         img.free();
   }
   catch ( e ) {}
}

// Lecture / écriture des pixels par lignes. Le mode le plus rapide disponible
// est détecté à la première utilisation (getSamples / setSamples sur tableau
// typé, sur tableau ordinaire, sinon pixel par pixel).
var READ_MODE = 0, WRITE_MODE = 0;
function IO_NAMES()
{
   return [ "", L( "rapide (tableau typé)", "fast (typed array)" ), L( "rapide (tableau)", "fast (array)" ),
            L( "pixel par pixel (lent)", "pixel by pixel (slow)" ) ];
}

function detectRead( img )
{
   var W = img.width, y = Math.floor( img.height / 2 ), c = 0;
   var xs = [ 0, Math.floor( W / 3 ), Math.floor( W / 2 ), W - 1 ];
   var same = function( arr )
   {
      for ( var k = 0; k < xs.length; ++k )
         if ( !( Math.abs( arr[xs[k]] - img.sample( xs[k], y, c ) ) < 1e-6 ) )
            return false;
      return true;
   };
   try
   {
      var t = new Float32Array( W );
      for ( var x = 0; x < W; ++x )
         t[x] = NaN;
      img.getSamples( t, new Rect( 0, y, W, y + 1 ), c );
      if ( same( t ) ) { READ_MODE = 1; return; }
   }
   catch ( e ) {}
   try
   {
      var a = [];
      img.getSamples( a, new Rect( 0, y, W, y + 1 ), c );
      if ( a.length >= W && same( a ) ) { READ_MODE = 2; return; }
   }
   catch ( e ) {}
   READ_MODE = 3;
}

function detectWrite()
{
   var vals = [ 0.125, 0.25, 0.5, 0.75 ];
   var ok = function( t )
   {
      for ( var x = 0; x < 4; ++x )
         if ( !( Math.abs( t.sample( x, 1, 0 ) - vals[x] ) < 1e-6 ) )
            return false;
      return true;
   };
   try
   {
      var t1 = new Image( 4, 2, 1, ColorSpace_Gray, 32, SampleType_Real );
      var f = new Float32Array( 4 );
      for ( var x = 0; x < 4; ++x ) f[x] = vals[x];
      t1.setSamples( f, new Rect( 0, 1, 4, 2 ), 0 );
      if ( ok( t1 ) ) { WRITE_MODE = 1; freeImage( t1 ); return; }
      freeImage( t1 );
   }
   catch ( e ) {}
   try
   {
      var t2 = new Image( 4, 2, 1, ColorSpace_Gray, 32, SampleType_Real );
      t2.setSamples( vals.slice( 0 ), new Rect( 0, 1, 4, 2 ), 0 );
      if ( ok( t2 ) ) { WRITE_MODE = 2; freeImage( t2 ); return; }
      freeImage( t2 );
   }
   catch ( e ) {}
   WRITE_MODE = 3;
}

function readRow( img, y, c, buf )
{
   var W = img.width;
   if ( READ_MODE == 0 )
   {
      detectRead( img );
      log( L( "  accès aux pixels en lecture : ", "  pixel access for reading: " ) + IO_NAMES()[READ_MODE] );
   }
   if ( READ_MODE == 1 )
      img.getSamples( buf, new Rect( 0, y, W, y + 1 ), c );
   else if ( READ_MODE == 2 )
   {
      var a = [];
      img.getSamples( a, new Rect( 0, y, W, y + 1 ), c );
      for ( var x = 0; x < W; ++x )
         buf[x] = a[x];
   }
   else
      for ( var x = 0; x < W; ++x )
         buf[x] = img.sample( x, y, c );
}

function writeRow( img, y, c, buf )
{
   var W = img.width;
   if ( WRITE_MODE == 0 )
   {
      detectWrite();
      log( L( "  accès aux pixels en écriture : ", "  pixel access for writing: " ) + IO_NAMES()[WRITE_MODE] );
   }
   if ( WRITE_MODE == 1 )
      img.setSamples( buf, new Rect( 0, y, W, y + 1 ), c );
   else if ( WRITE_MODE == 2 )
   {
      var a = new Array( W );
      for ( var x = 0; x < W; ++x )
         a[x] = buf[x];
      img.setSamples( a, new Rect( 0, y, W, y + 1 ), c );
   }
   else
      for ( var x = 0; x < W; ++x )
         img.setSample( buf[x], x, y, c );
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
   P.newImageColorSpace = enumVal( PixelMath, "SameAsTarget" );
   P.newImageSampleFormat = enumVal( PixelMath, "f32" );
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
   var row = new Float32Array( W );
   for ( var y = 0; y < H; ++y )
   {
      readRow( img, y, channel, row );
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
      if ( y % 2000 == 0 )
         pumpEvents();
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
      return copyF32( src );
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
   pass( src, tmp, w, h, w, 1 );     // lignes
   pass( tmp, dst, h, w, 1, w );     // colonnes
   return dst;
}

function copyF32( src )
{
   var d = new Float32Array( src.length );
   for ( var i = 0; i < src.length; ++i )
      d[i] = src[i];
   return d;
}

// k-ième plus petit élément (sélection rapide, modifie a).
function selectK( a, k )
{
   var l = 0, r = a.length - 1;
   while ( r > l )
   {
      var pivot = a[( l + r ) >> 1];
      var i = l, j = r;
      while ( i <= j )
      {
         while ( a[i] < pivot ) ++i;
         while ( a[j] > pivot ) --j;
         if ( i <= j )
         {
            var t = a[i]; a[i] = a[j]; a[j] = t;
            ++i; --j;
         }
      }
      if ( k <= j )
         r = j;
      else if ( k >= i )
         l = i;
      else
         break;
   }
   return a[k];
}

function percentileOf( arr, p )
{
   var n = arr.length;
   if ( n == 0 )
      return NaN;
   var a = new Float64Array( n );
   for ( var i = 0; i < n; ++i )
      a[i] = arr[i];
   var pos = ( p / 100 ) * ( n - 1 );
   var i0 = Math.floor( pos ), f = pos - i0;
   var v0 = selectK( a, i0 );
   if ( f <= 0 || i0 + 1 >= n )
      return v0;
   var v1 = Infinity;
   for ( var i = i0 + 1; i < n; ++i )
      if ( a[i] < v1 )
         v1 = a[i];
   return v0 * ( 1 - f ) + v1 * f;
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

// Moyenne circulaire de la teinte, pondérée par la saturation, sur un masque.
function meanHue( fr, fg, fb, mask )
{
   var sx = 0, sy = 0, n = 0;
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
         ++n;
      }
   if ( n == 0 )
      return NaN;
   return wrap360( Math.atan2( sy, sx ) * 180 / Math.PI );
}

// ============================================================================
// Passe 1 : analyse
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

function analyse( p )
{
   var t0 = Date.now();
   var v = checkInputs( p );
   var W = v.T.image.width, H = v.T.image.height;
   var s = Math.max( 1, Math.round( Math.max( W, H ) / 1200 ) );
   var ww = Math.ceil( W / s ), wh = Math.ceil( H / s ), n = ww * wh;
   log( "<b>" + TITLE + L( " : analyse</b> (", ": analysis</b> (" ) + W + "x" + H + L( ", travail en ", ", working size " ) + ww + "x" + wh + ")" );

   // Lecture des couches (copies) : moyennes par blocs + histogrammes 16 bits
   var raw = [], hists = [];
   var srcLines = [ v.S, v.H, v.O ];
   for ( var i = 0; i < 3; ++i )
   {
      log( L( "  lecture de ", "  reading " ) + LINES[i] + " (" + srcLines[i].id + ")" );
      pumpEvents();
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
      pumpEvents();
   }
   log( L( "  lecture de l'image finale (", "  reading the final image (" ) + v.T.id + ")" );
   pumpEvents();
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
      D.hueA = meanHue( fr, fg, fb, top );     // là où A est relativement plus fort
      D.hueB = meanHue( fr, fg, fb, bot );     // là où B est relativement plus fort
      D.h0 = meanHue( fr, fg, fb, zone );
      D.sep = wrapDeg( D.hueB - D.hueA );
      D.spread = D.p90 - D.p10;
      D.med = percentileOf( zoneU, 50 );
      var dev = [];
      for ( var j = 0; j < zoneU.length; ++j )
         dev.push( Math.abs( zoneU[j] - D.med ) );
      D.scale = Math.max( 1e-4, percentileOf( dev, 95 ) );
      D.confused = D.spread >= 0.1 && Math.abs( D.sep ) < 10;
      D.verdict = D.confused ? "merged" : ( Math.abs( D.sep ) >= 25 ? "sep" : "partial" );
      diag.push( D );
   }

   // Couleur actuelle de chaque raie
   var fam = [ NaN, NaN, NaN ], inPair = [ -1, -1, -1 ];
   for ( var q = 0; q < 3; ++q )
      if ( diag[q].confused )
      {
         fam[diag[q].a] = diag[q].h0;
         fam[diag[q].b] = diag[q].h0;
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
         fam[i] = meanHue( fr, fg, fb, m );
         if ( isNaN( fam[i] ) )
            fam[i] = [ 10, 40, 220 ][i];
      }

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

   // Cartes "caractère" de chaque raie
   var ch = [ new Float32Array( n ), new Float32Array( n ), new Float32Array( n ) ];
   for ( var q = 0; q < 3; ++q )
   {
      var D = diag[q];
      if ( !D.confused )
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
      if ( inPair[i] < 0 )
         for ( var j = 0; j < n; ++j )
            ch[i][j] = clamp( ( pr[i][j] - 0.4 ) / 0.4, 0, 1 );
   for ( var i = 0; i < 3; ++i )
   {
      for ( var j = 0; j < n; ++j )
         ch[i][j] *= wsig[j];
      ch[i] = gaussBlur( ch[i], ww, wh, p.blurMap / s );
   }

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

   // Poids du signal lissé (passe 3 : rien ne bouge sur le fond)
   var sigMap = gaussBlur( wsig, ww, wh, p.blurMap / s );

   ANA = {
      key: analysisKey( p ), W: W, H: H, s: s, ww: ww, wh: wh,
      fr: fr, fg: fg, fb: fb, ch: ch, ys: ys, cb: cb, cr: cr, sig: sigMap, pr: pr,
      diag: diag, fam: fam, famSpread: famSpread, inPair: inPair, bg: bg, kS: p.kS, kO: p.kO
   };

   log( format( L( "  Fonds : SII %.6f  Ha %.6f  OIII %.6f%s | poids : SII x%.3f  OIII x%.3f%s",
                   "  Backgrounds: SII %.6f  Ha %.6f  OIII %.6f%s | weights: SII x%.3f  OIII x%.3f%s" ),
        p.bgS, p.bgH, p.bgO, p.autoBg ? " (auto)" : "", p.kS, p.kO, p.autoWeights ? " (auto)" : "" ) );
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
   log( format( L( "  Couleur actuelle : SII %.0f° (±%.0f°)  Ha %.0f° (±%.0f°)  OIII %.0f° (±%.0f°)",
                   "  Current colour: SII %.0f° (±%.0f°)  Ha %.0f° (±%.0f°)  OIII %.0f° (±%.0f°)" ),
        fam[0], famSpread[0], fam[1], famSpread[1], fam[2], famSpread[2] ) );
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

// Réglages proposés à partir du diagnostic
function proposedTolerance( ana, i )
{
   var paired = ana.inPair && ana.inPair[i] >= 0;
   var tol = clamp( Math.round( ana.famSpread[i] + 15 ), paired ? 60 : 45, 120 );
   for ( var k = 0; k < 3; ++k )
   {
      var dist = Math.abs( wrapDeg( ana.fam[k] - ana.fam[i] ) );
      if ( k != i && dist > 5 )
         tol = Math.min( tol, Math.max( 30, Math.round( 0.8 * dist ) ) );
   }
   return tol;
}

function propose( p, ana )
{
   for ( var i = 0; i < 3; ++i )
   {
      p[T_KEYS[i]] = Math.round( ana.fam[i] );
      p[F_KEYS[i]] = 0;
      p[W_KEYS[i]] = proposedTolerance( ana, i );
      p[SAT_KEYS[i]] = 1;
   }
   var pal = PALETTES[p.palette] || "SHO";
   for ( var q = 0; q < 3; ++q )
   {
      var D = ana.diag[q];
      if ( !D.confused )
         continue;
      var ra = pal.indexOf( LETTER[D.a] ), rb = pal.indexOf( LETTER[D.b] );
      var lo = ra < rb ? D.a : D.b, hi = ra < rb ? D.b : D.a;
      p[T_KEYS[lo]] = Math.round( wrap360( D.h0 - p.split ) );
      p[T_KEYS[hi]] = Math.round( wrap360( D.h0 + p.split ) );
      p[F_KEYS[lo]] = 2;
      p[F_KEYS[hi]] = 2;
   }
   p.targetsSet = true;
}

// ============================================================================
// Passe 2 : mélange (rotation de teinte à luminance constante)
// ============================================================================

function mixParams( p, ana )
{
   var P = [];
   for ( var i = 0; i < 3; ++i )
      P.push( {
         active: p[F_KEYS[i]] > 0 || p[SAT_KEYS[i]] != 1,
         force: p[F_KEYS[i]],
         fam: ana.fam[i],
         tol: Math.max( 1, p[W_KEYS[i]] ),
         phi: ycAngleOfHue( p[T_KEYS[i]] ),
         sat: p[SAT_KEYS[i]],
         d3: 0
      } );
   // Passe 3 : chaque famille (une par raie) est tournée vers la teinte de la palette, en gardant
   // la moitié de ses variations internes. Appartenance : proportion de la raie (paire confondue :
   // proportion de la paire, partagée entre ses deux raies par les cartes "caractère").
   P.p3on = p.p3Preset > 0 && p.p3Amt > 0;
   if ( P.p3on )
   {
      P.p3amt = p.p3Amt;
      P.p3sat = p.p3Sat;
      P.kappa = 0.5;
      P.pairA = -1;
      P.pairB = -1;
      for ( var q = 0; q < 3; ++q )
         if ( ana.diag[q].confused && P.pairA < 0 )
         {
            P.pairA = ana.diag[q].a;
            P.pairB = ana.diag[q].b;
         }
      P.pal = [];
      for ( var i = 0; i < 3; ++i )
         P.pal.push( ycAngleOfHue( p[P3_KEYS[i]] ) );
      P.w3 = [ 0, 0, 0 ];
      // Centre de chaque famille après la passe 2 : moyenne circulaire sur un échantillon
      P.p3on = false;
      var n = ana.ww * ana.wh, step = Math.max( 1, Math.floor( n / 60000 ) ), out = [ 0, 0, 0 ];
      var sx = [ 0, 0, 0 ], sy = [ 0, 0, 0 ], sw = [ 0, 0, 0 ], w = [ 0, 0, 0 ];
      for ( var j = 0; j < n; j += step )
      {
         var sg = ana.sig[j];
         if ( sg < 0.05 )
            continue;
         mixPixel( ana.fr[j], ana.fg[j], ana.fb[j], ana.ch[0][j], ana.ch[1][j], ana.ch[2][j],
                   ana.ys[j], ana.cb[j], ana.cr[j], P, out, null, 0 );
         var Y = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
         var Cb = ( out[2] - Y ) / 1.8556, Cr = ( out[0] - Y ) / 1.5748, m = Math.sqrt( Cb * Cb + Cr * Cr );
         if ( m < 1e-4 )
            continue;
         p3Weights( ana.pr[0][j], ana.pr[1][j], ana.pr[2][j], ana.ch[0][j], ana.ch[1][j], ana.ch[2][j], sg, P, w );
         for ( var i = 0; i < 3; ++i )
         {
            var k = w[i] * sg * m;
            sx[i] += k * Cb / m;
            sy[i] += k * Cr / m;
            sw[i] += k;
         }
      }
      P.c = [];
      for ( var i = 0; i < 3; ++i )
         P.c.push( sw[i] > 1e-9 ? Math.atan2( sy[i], sx[i] ) :
                   ( p[F_KEYS[i]] > 0 ? P[i].phi : ycAngleOfHue( ana.fam[i] ) ) );
      P.rot = [];
      for ( var i = 0; i < 3; ++i )
         P.rot.push( wrapRad( P.pal[i] - P.c[i] ) );
      P.fadeA = 2 * Math.PI / 3;
      P.p3on = true;
   }
   return P;
}

// Calcule la nouvelle couleur d'un pixel. out = [r, g, b]. Retourne true si modifié.
// Appartenance d'un pixel aux familles de la passe 3 (somme 1). Dominance des proportions
// (exposant 3) ; une paire confondue compte comme un groupe, partagé entre ses deux raies
// selon les cartes "caractère" (là où l'une est plus forte que d'habitude).
function p3Weights( p0, p1, p2, c0, c1, c2, sg, P, w )
{
   var pr = [ p0, p1, p2 ], ch = [ c0, c1, c2 ];
   w[0] = w[1] = w[2] = 0;
   if ( P.pairA >= 0 )
   {
      var a = P.pairA, b = P.pairB, o = 3 - a - b;
      var gp = Math.pow( pr[a] + pr[b], 3 ), go = Math.pow( pr[o], 3 ), t = gp + go;
      if ( t <= 1e-12 )
         return;
      var u = clamp( ( ch[a] - ch[b] ) / Math.max( sg, 0.05 ), -1, 1 ), sa = 0.5 + 0.5 * u;
      w[a] = gp / t * sa;
      w[b] = gp / t * ( 1 - sa );
      w[o] = go / t;
   }
   else
   {
      var g0 = Math.pow( p0, 3 ), g1 = Math.pow( p1, 3 ), g2 = Math.pow( p2, 3 ), t = g0 + g1 + g2;
      if ( t <= 1e-12 )
         return;
      w[0] = g0 / t;
      w[1] = g1 / t;
      w[2] = g2 / t;
   }
}

function mixPixel( r, g, b, c0, c1, c2, ys, cbs, crs, P, out, st, sg, p0, p1, p2 )
{
   out[0] = r; out[1] = g; out[2] = b;
   var p3 = P.p3on && sg > 1e-4;
   if ( c0 < 1e-5 && c1 < 1e-5 && c2 < 1e-5 && !p3 )
      return false;
   var Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
   var Cb = ( b - Y ) / 1.8556, Cr = ( r - Y ) / 1.5748;
   var m = Math.sqrt( Cb * Cb + Cr * Cr );
   if ( m < 1e-7 )
      return false;
   // teinte de la couleur lissée (famille actuelle)
   var rs = ys + 1.5748 * crs, bs = ys + 1.8556 * cbs, gs = ( ys - 0.2126 * rs - 0.0722 * bs ) / 0.7152;
   var hs = hueDeg( rs, gs, bs );
   if ( hs < 0 )
      return false;
   var c = [ c0, c1, c2 ], a = [ 0, 0, 0 ], A = 0;
   for ( var i = 0; i < 3; ++i )
   {
      var Li = P[i];
      if ( !Li.active )
         continue;
      var close = 1 - Math.abs( wrapDeg( hs - Li.fam ) ) / Li.tol;
      if ( close <= 0 )
         continue;
      var w = Math.min( 1, Li.force * c[i] );
      if ( Li.force <= 0 )
         w = Math.min( 1, c[i] );          // saturation seule : dosée par le caractère
      a[i] = w * close;
      A += a[i];
   }
   if ( A <= 1e-6 && !p3 )
      return false;
   if ( A > 1 )
   {
      for ( var i = 0; i < 3; ++i )
         a[i] /= A;
      A = 1;
   }
   if ( st )
      for ( var i = 0; i < 3; ++i )
         if ( a[i] > 0.02 )
            ++st[i];
   var phi = Math.atan2( Cr, Cb ), theta = 0, satf = 1;
   for ( var i = 0; i < 3; ++i )
      if ( a[i] > 0 )
      {
         if ( P[i].force > 0 )
            theta += a[i] * wrapRad( P[i].phi - phi );
         satf += a[i] * ( P[i].sat - 1 );
      }
   if ( p3 )
   {
      // Passe 3 : la couleur issue de la passe 2 est tirée vers la teinte de palette de sa famille
      var w3 = P.w3, ph2 = phi + theta, add = 0, sum = 0;
      p3Weights( p0, p1, p2, c0, c1, c2, sg, P, w3 );
      for ( var i = 0; i < 3; ++i )
         if ( w3[i] > 0 )
         {
            // teinte visée = palette + kappa x écart au centre ; effet effacé quand la teinte
            // est à plus de 120° du centre (à 180°, le sens de rotation serait indéterminé)
            var d3 = wrapRad( ph2 - P.c[i] ), ad = Math.abs( d3 ), g3 = 1;
            if ( ad > P.fadeA )
            {
               var t3 = ( Math.PI - ad ) / ( Math.PI - P.fadeA );
               g3 = t3 * t3 * ( 3 - 2 * t3 );
            }
            add += w3[i] * g3 * ( P.rot[i] - ( 1 - P.kappa ) * d3 );
            sum += w3[i];
         }
      var k3 = P.p3amt * Math.min( 1, sg );
      theta += k3 * add;
      satf *= 1 + k3 * sum * ( P.p3sat - 1 );
      if ( k3 * sum <= 1e-6 && A <= 1e-6 )
         return false;
   }
   if ( satf < 0 )
      satf = 0;
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

function p3Name( idx )
{
   var e = P3_PRESETS[idx] || P3_PRESETS[0];
   return L( e[0], e[1] );
}

// Applique un préréglage de palette aux paramètres (sans effet pour Aucune et Personnalisée).
function applyP3Preset( p, idx )
{
   p.p3Preset = idx;
   var e = P3_PRESETS[idx];
   if ( !e || isNaN( e[2] ) )
      return;
   p.p3S = e[2];
   p.p3H = e[3];
   p.p3O = e[4];
   p.p3Sat = e[5];
   if ( !( p.p3Amt > 0 ) )
      p.p3Amt = 1;
}

// Mélange sur l'image de travail (aperçu). Retourne une Image RVB 32 bits.
function previewImage( p, ana, before, st )
{
   var ww = ana.ww, wh = ana.wh;
   var img = new Image( ww, wh, 3, ColorSpace_RGB, 32, SampleType_Real );
   var rr = new Float32Array( ww ), rg = new Float32Array( ww ), rb = new Float32Array( ww );
   var P = mixParams( p, ana ), out = [ 0, 0, 0 ];
   for ( var y = 0; y < wh; ++y )
   {
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
      writeRow( img, y, 0, rr );
      writeRow( img, y, 1, rg );
      writeRow( img, y, 2, rb );
   }
   return img;
}

// Image des cartes de raies : rouge = SII, vert = Ha, bleu = OIII (caractère de chaque raie).
function showLineMap( ana )
{
   var ww = ana.ww, wh = ana.wh;
   var img = new Image( ww, wh, 3, ColorSpace_RGB, 32, SampleType_Real );
   var row = new Float32Array( ww );
   for ( var c = 0; c < 3; ++c )
   {
      var src = ana.ch[c];
      for ( var y = 0; y < wh; ++y )
      {
         for ( var x = 0; x < ww; ++x )
            row[x] = clamp( src[y * ww + x], 0, 1 );
         writeRow( img, y, c, row );
      }
   }
   var win = new ImageWindow( ww, wh, 3, 32, true, true, validId( "B238_carte_raies" ) );
   win.mainView.beginProcess();
   win.mainView.image.assign( img );
   win.mainView.endProcess();
   freeImage( img );
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
   var res = new Image( W, H, 3, ColorSpace_RGB, 32, SampleType_Real );
   var nChanged = 0, nNewClip = 0, maxDY = 0;
   try
   {
      var simg = src.image;
      var sr = new Float32Array( W ), sg = new Float32Array( W ), sb = new Float32Array( W );
      var rr = new Float32Array( W ), rg = new Float32Array( W ), rb = new Float32Array( W );
      var maps = [ ana.ch[0], ana.ch[1], ana.ch[2], ana.ys, ana.cb, ana.cr, ana.sig, ana.pr[0], ana.pr[1], ana.pr[2] ], mv = new Float64Array( 10 );
      for ( var y = 0; y < H; ++y )
      {
         var fy = clamp( ( y + 0.5 ) / s - 0.5, 0, wh - 1 ), y0 = Math.floor( fy ), y1 = Math.min( y0 + 1, wh - 1 ), ty = fy - y0;
         readRow( simg, y, 0, sr );
         readRow( simg, y, 1, sg );
         readRow( simg, y, 2, sb );
         for ( var x = 0; x < W; ++x )
         {
            var fx = clamp( ( x + 0.5 ) / s - 0.5, 0, ww - 1 ), x0 = Math.floor( fx ), x1 = Math.min( x0 + 1, ww - 1 ), tx = fx - x0;
            var r = sr[x], g = sg[x], b = sb[x];
            mv[0] = bilin( maps[0], ww, wh, x0, x1, tx, y0, y1, ty );
            mv[1] = bilin( maps[1], ww, wh, x0, x1, tx, y0, y1, ty );
            mv[2] = bilin( maps[2], ww, wh, x0, x1, tx, y0, y1, ty );
            mv[6] = P.p3on ? bilin( maps[6], ww, wh, x0, x1, tx, y0, y1, ty ) : 0;
            if ( mv[0] < 1e-5 && mv[1] < 1e-5 && mv[2] < 1e-5 && mv[6] <= 1e-4 )
            {
               rr[x] = r; rg[x] = g; rb[x] = b;
               continue;
            }
            for ( var k = 3; k < ( P.p3on ? 10 : 6 ); ++k )
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
         writeRow( res, y, 0, rr );
         writeRow( res, y, 1, rg );
         writeRow( res, y, 2, rb );
         if ( y % 1000 == 0 && y > 0 )
         {
            console.writeln( format( "  %d %%", Math.round( 100 * y / H ) ) );
            pumpEvents();
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
   win.mainView.beginProcess();
   win.mainView.image.assign( res );
   win.mainView.endProcess();
   freeImage( res );

   log( L( "<b>Réglages</b> (palette ", "<b>Settings</b> (palette " ) + PALETTES[p.palette] + ")" );
   for ( var i = 0; i < 3; ++i )
      log( format( L( "  %-4s couleur actuelle %3.0f° -> cible %3.0f° | force %.2f | tolérance %.0f° | saturation %.2f",
                      "  %-4s current colour %3.0f° -> target %3.0f° | strength %.2f | tolerance %.0f° | saturation %.2f" ),
           LINES[i], ana.fam[i], p[T_KEYS[i]], p[F_KEYS[i]], p[W_KEYS[i]], p[SAT_KEYS[i]] ) );
   if ( p.p3Preset > 0 && p.p3Amt > 0 )
      log( format( L( "  Passe 3 : palette « %s » : SII %.0f°  Ha %.0f°  OIII %.0f° | saturation %.2f | intensité %.2f",
                      "  Pass 3: palette \"%s\": SII %.0f°  Ha %.0f°  OIII %.0f° | saturation %.2f | intensity %.2f" ),
           p3Name( p.p3Preset ), p.p3S, p.p3H, p.p3O, p.p3Sat, p.p3Amt ) );
   log( format( L( "  Pixels dont la couleur a bougé : %.1f %% | écart de luminance maximal : %.5f | nouveaux pixels écrêtés : %d",
                   "  Pixels whose colour changed: %.1f %% | maximum luminance difference: %.5f | newly clipped pixels: %d" ),
        100 * nChanged / ( W * H ), maxDY, nNewClip ) );
   log( format( L( "Résultat : <b>%s</b> (%.1f s)", "Result: <b>%s</b> (%.1f s)" ), id, ( Date.now() - t0 ) / 1000 ) );
   win.show();
   win.zoomToFit();
   return win.mainView;
}

// ============================================================================
// Aperçu (zone défilante avec zoom)
// ============================================================================

function PreviewBox( parent )
{
   this.__base__ = ScrollBox;
   this.__base__( parent );
   this.bitmap = null;
   this.zoom = 1;
   this.fit = true;
   this.sx = 0;
   this.sy = 0;
   this.dragging = false;
   this.dx0 = 0;
   this.dy0 = 0;
   this.autoScroll = true;
   this.tracking = true;
   var self = this;

   this.maxScroll = function()
   {
      if ( !self.bitmap )
         return [ 0, 0 ];
      return [ Math.max( 0, Math.round( self.bitmap.width * self.zoom ) - self.viewport.width ),
               Math.max( 0, Math.round( self.bitmap.height * self.zoom ) - self.viewport.height ) ];
   };

   this.updateRange = function()
   {
      var m = self.maxScroll();
      self.setHorizontalScrollRange( 0, m[0] );
      self.setVerticalScrollRange( 0, m[1] );
      self.sx = clamp( self.sx, 0, m[0] );
      self.sy = clamp( self.sy, 0, m[1] );
      self.viewport.update();
   };

   this.zoomAt = function( z, vx, vy )
   {
      var ratio = z / self.zoom;
      self.zoom = z;
      self.sx = ( self.sx + vx ) * ratio - vx;
      self.sy = ( self.sy + vy ) * ratio - vy;
      self.updateRange();
   };

   this.zoomFit = function()
   {
      self.fit = true;
      if ( self.bitmap )
         self.zoom = Math.max( 0.05, Math.min( self.viewport.width / self.bitmap.width,
                                               self.viewport.height / self.bitmap.height ) );
      self.sx = 0;
      self.sy = 0;
      self.updateRange();
   };

   this.zoomOne = function()
   {
      self.fit = false;
      self.zoom = 1;
      self.updateRange();
   };

   this.setBitmap = function( bmp )
   {
      self.bitmap = bmp;
      if ( self.fit )
         self.zoomFit();
      else
         self.updateRange();
   };

   this.onHorizontalScrollPosUpdated = function( x ) { self.sx = x; self.viewport.update(); };
   this.onVerticalScrollPosUpdated = function( y ) { self.sy = y; self.viewport.update(); };

   this.viewport.onResize = function()
   {
      if ( self.fit ) self.zoomFit(); else self.updateRange();
   };
   this.viewport.onMousePress = function( x, y, button, buttons, modifiers )
   {
      self.dragging = true;
      self.dx0 = x;
      self.dy0 = y;
   };
   this.viewport.onMouseRelease = function( x, y, button, buttons, modifiers )
   {
      self.dragging = false;
   };
   this.viewport.onMouseMove = function( x, y, buttons, modifiers )
   {
      if ( !self.dragging )
         return;
      var m = self.maxScroll();
      self.sx = clamp( self.sx + ( self.dx0 - x ), 0, m[0] );
      self.sy = clamp( self.sy + ( self.dy0 - y ), 0, m[1] );
      self.dx0 = x;
      self.dy0 = y;
      self.viewport.update();
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
         var bw = self.bitmap.width * self.zoom, bh = self.bitmap.height * self.zoom;
         var ox = ( bw > this.width ) ? -self.sx : ( this.width - bw ) / 2;
         var oy = ( bh > this.height ) ? -self.sy : ( this.height - bh ) / 2;
         g.scaleTransformation( self.zoom );
         g.translateTransformation( ox / self.zoom, oy / self.zoom );
         g.drawBitmap( 0, 0, self.bitmap );
      }
      g.end();
   };
}
PreviewBox.prototype = new ScrollBox;

// ============================================================================
// Dialogue
// ============================================================================

var TIPS = {};

function buildTips()
{
   if ( LANG == "fr" )
      return {
   s: "<p><b>SII linéaire sans étoiles</b> (niveaux de gris), telle quelle, sans étirement : par exemple " +
      "SII_starless_noisX.</p><p>Elle sert <b>uniquement à repérer où le SII domine</b> (zones de recouvrement " +
      "entre raies). Ce n'est pas elle qui change de couleur, et elle n'est pas modifiée.</p>",
   h: "<p><b>Ha linéaire sans étoiles</b> (niveaux de gris), telle quelle. Sert uniquement à repérer où le Ha " +
      "domine. Non modifiée.</p>",
   o: "<p><b>OIII linéaire sans étoiles</b> (niveaux de gris), telle quelle. Sert uniquement à repérer où l'OIII " +
      "domine. Non modifiée.</p>",
   t: "<p><b>Image finale étirée</b> (RVB, sans étoiles de préférence) : c'est elle dont on change les couleurs. " +
      "Elle n'est pas modifiée : le résultat est une copie &lt;id&gt;_mix.</p><p>Elle doit être alignée pixel à " +
      "pixel avec les trois couches (pas de recadrage ni de rotation entre les deux).</p>",
   palette: "<p><b>Ordre des raies dans l'image finale</b> : quelle raie est dans le rouge, le vert, le bleu " +
      "(SHO : SII rouge, Ha vert, OIII bleu). Sert seulement à proposer le sens de séparation d'une paire " +
      "confondue : la raie du canal le plus rouge part vers le rouge, l'autre vers le jaune.</p>",
   analyse: "<p><b>Passe 1.</b> Lit les quatre images (copies), mesure pour chaque paire de raies si leur " +
      "rapport change la couleur de l'image finale, et prépare les cartes pour l'aperçu. À refaire si on " +
      "change une image ou un réglage avancé.</p><p>La première analyse propose aussi les réglages. Ensuite " +
      "tes réglages sont gardés (même d'une session à l'autre) : bouton Proposition pour revenir à la " +
      "proposition, par exemple sur un nouvel objet.</p>",
   propose: "<p>Lance l'analyse si besoin, puis remet les couleurs cibles, forces, tolérances et saturations " +
      "proposées par l'analyse : chaque raie sur sa couleur actuelle (aucun changement), et pour chaque paire " +
      "confondue, les deux raies écartées de part et d'autre de leur couleur commune.</p>",
   map: "<p>Lance l'analyse si besoin, puis ouvre l'image des cartes utilisées, à la taille de travail : rouge = " +
      "où le SII est plus fort que d'habitude, vert = Ha, bleu = OIII. Noir = rien ne bougera (fond, signal trop " +
      "faible).</p>",
   diag: "<p><b>Diagnostic des paires.</b> Partage : part du signal où les deux raies sont ensemble. " +
      "Rapport : comment leur proportion varie (10e à 90e centile). Écart : différence de teinte, dans " +
      "l'image finale, entre les zones où l'une domine et celles où l'autre domine.</p>" +
      "<p>Rapport qui varie mais écart sous 10° : la paire est <b>confondue</b> (bichromie).</p>",
   target: "<p><b>Couleur cible</b> (teinte en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, " +
      "180 cyan, 240 bleu, 300 magenta). Les zones où cette raie est plus forte sont tirées vers cette " +
      "teinte. La pastille montre la couleur.</p><p>Laisser la cible sur la couleur actuelle = rien ne change.</p>",
   force: "<p><b>Force</b> : jusqu'où les zones de cette raie vont vers la cible. 0 = raie inactive (la cible " +
      "n'a aucun effet), 1 = en partie, 2 à 3 = presque jusqu'à la cible. Un pixel ne dépasse jamais la cible.</p>" +
      "<p>Toucher la cible ou la tolérance d'une raie inactive met sa force à 1 automatiquement.</p>",
   tol: "<p><b>Tolérance</b> (degrés) : quelles couleurs actuelles ont le droit de bouger. Seuls les pixels " +
      "dont la teinte est à moins de cette valeur de la couleur actuelle de la raie sont touchés, avec un " +
      "effet qui diminue en s'éloignant.</p><p>C'est ce qui protège les zones d'une autre couleur (une " +
      "nébuleuse OIII bleue ne bouge pas quand on règle le SII et le Ha).</p>",
   sat: "<p><b>Saturation</b> de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus " +
      "franche, 0,8 = plus douce. La luminosité ne change pas. Si une couleur sort des couleurs " +
      "affichables, le garde-fou la limite.</p>",
   fine: "<p><b>Curseur fin</b> : zoom autour de la valeur du curseur du dessus, pour un réglage précis. " +
      "Il se recentre quand on relâche la souris ou quand la valeur change ailleurs. On peut aussi taper la " +
      "valeur dans la case.</p>",
   p3preset: "<p><b>Passe 3 : palette (cosmétique, facultative).</b> Une fois les raies séparées (passe 2), " +
      "chaque famille de couleur (une par raie) est tournée en bloc vers la teinte de la palette choisie. " +
      "La séparation est gardée, seules les couleurs changent. Rien ne bouge sur le fond.</p>" +
      "<p><b>Aucune</b> : passe 3 désactivée. <b>Vraies couleurs</b> : teintes calculées depuis les longueurs " +
      "d'onde (SII et Ha donnent le même rouge, OIII un vert-turquoise). <b>Personnalisée</b> : tes propres " +
      "teintes ; modifier une teinte bascule automatiquement sur Personnalisée.</p>",
   p3hue: "<p><b>Teinte de la palette</b> pour la famille de cette raie (degrés : 0 rouge, 30 orange, 50 or, " +
      "60 jaune, 120 vert, 180 cyan, 240 bleu, 300 magenta). La pastille montre la couleur.</p>",
   p3sat: "<p><b>Saturation de la palette</b> : 1 = inchangée, moins de 1 = couleurs plus douces " +
      "(palette minérale), plus de 1 = plus franches. Ne touche que les zones de signal.</p>",
   p3amt: "<p><b>Intensité de la palette</b> : 1 = teintes de la palette atteintes, 0,5 = à mi-chemin entre " +
      "le résultat de la passe 2 et la palette, 0 = passe 3 sans effet.</p>",
   lang: "<p>Langue de l'interface. Le dialogue se rouvre aussitôt dans la langue choisie, en gardant " +
      "l'analyse et les réglages. Le choix est mémorisé.</p><p>Interface language. The dialog reopens in " +
      "the chosen language, keeping the analysis and settings.</p>",
   blurLines: "<p><b>Lissage des raies</b> (StdDev en pixels pleine résolution) avant de comparer leurs " +
      "rapports, pour que le bruit ne décide pas. Validé : 20 px sur Cassiopée (2,9\"/px).</p>",
   blurMap: "<p><b>Lissage des cartes</b> (px) : douceur des transitions entre zones de raies différentes. " +
      "Validé : 10 px.</p>",
   blurColor: "<p><b>Lissage de la couleur actuelle</b> (px) utilisée pour la tolérance, pour que le grain " +
      "chromatique ne décide pas. Validé : 5 px.</p>",
   split: "<p><b>Écart proposé</b> (degrés) : quand une paire est confondue, la proposition place ses deux " +
      "raies à ± cette valeur autour de leur couleur commune.</p>",
   sigPct: "<p><b>Seuil de signal</b> : centile du signal total au-dessus duquel l'effet est complet. En " +
      "dessous, il diminue jusqu'à zéro sur le fond. Plus haut = effet réservé aux zones fortes. Validé : 60.</p>",
   bg: "<p><b>Fond de ciel de chaque couche linéaire</b>. Auto = pic de l'histogramme 16 bits " +
      "(0,145022 sur Cassiopée). <b>Réglage sensible</b> : les signaux comparés sont de l'ordre de 0,00001.</p>",
   weights: "<p><b>Mise à niveau</b> de SII et OIII sur Ha. Auto = médiane de Ha / médiane de la couche, " +
      "dans les 30 % de pixels où Ha est le plus fort (SII x2,46, OIII x6,06 sur Cassiopée).</p>",
   auto: "<p>Coché : calculé à chaque analyse et affiché ici. Décoché : la valeur saisie est utilisée.</p>",
   advanced: "<p>Affiche les réglages de l'analyse (lissages, fonds, poids).</p>",
   before: "<p>Montre l'image d'origine dans l'aperçu, pour comparer.</p>",
   refresh: "<p>Recalcule l'aperçu tout de suite. Lance l'analyse d'abord si elle n'est pas faite ou si un " +
      "réglage avancé a changé.</p>",
   fitB: "<p>Aperçu ajusté à la fenêtre. Molette : zoom. Glisser : déplacer.</p>",
   oneB: "<p>Aperçu à 100 % de l'image de travail (réduite, environ 1 200 pixels de large).</p>",
   newInstance: "<p><b>Nouvelle instance.</b> Glisser ce triangle sur le bureau crée une icône avec tous les " +
      "réglages (palette comprise) et le nom des quatre images. Double-clic : rouvre ce dialogue avec ces " +
      "réglages. Glisser l'icône sur l'image finale : applique directement.</p>",
   reset: "<p>Revenir aux réglages par défaut. L'analyse suivante refera la proposition.</p>",
   apply: "<p>Applique en pleine résolution et crée &lt;image finale&gt;_mix. La console donne les réglages, " +
      "le nombre de pixels modifiés, l'écart de luminance maximal et le nombre de nouveaux pixels écrêtés.</p>",
   close: "<p>Fermer. Les derniers réglages sont mémorisés.</p>"
      };

   return {
   s: "<p><b>Linear starless SII</b> (grayscale), as is, not stretched: for example SII_starless_noisX.</p>" +
      "<p>It is <b>only used to locate where SII dominates</b> (zones where the lines overlap). It is not the " +
      "image whose colours change, and it is never modified.</p>",
   h: "<p><b>Linear starless Ha</b> (grayscale), as is. Only used to locate where Ha dominates. Never modified.</p>",
   o: "<p><b>Linear starless OIII</b> (grayscale), as is. Only used to locate where OIII dominates. Never " +
      "modified.</p>",
   t: "<p><b>Final stretched image</b> (RGB, preferably starless): this is the image whose colours are changed. " +
      "It is not modified: the result is a copy &lt;id&gt;_mix.</p><p>It must be pixel-aligned with the three " +
      "masters (no crop or rotation between them).</p>",
   palette: "<p><b>Order of the lines in the final image</b>: which line is in red, green and blue (SHO: SII " +
      "red, Ha green, OIII blue). Only used to choose the direction of the split of a merged pair: the line " +
      "in the reddest channel goes toward red, the other toward yellow.</p>",
   analyse: "<p><b>Pass 1.</b> Reads the four images (copies), measures for each pair of lines whether their " +
      "ratio changes the colour of the final image, and builds the maps used by the preview. Run it again " +
      "after changing an image or an advanced setting.</p><p>The first analysis also proposes settings. After " +
      "that your settings are kept (even between sessions): use Proposal to go back to the proposal, for " +
      "example on a new target.</p>",
   propose: "<p>Runs the analysis if needed, then resets targets, strengths, tolerances and saturations to the " +
      "proposal: each line on its current colour (no change), and for each merged pair, the two lines pushed " +
      "apart on either side of their common colour.</p>",
   map: "<p>Runs the analysis if needed, then opens the maps used, at working size: red = where SII is " +
      "stronger than usual, green = Ha, blue = OIII. Black = nothing will move (background, weak signal).</p>",
   diag: "<p><b>Pair diagnosis.</b> Share: part of the signal where both lines are present. Ratio: how their " +
      "proportion varies (10th to 90th percentile). Hue diff.: hue difference, in the final image, between " +
      "areas where one line dominates and areas where the other does.</p>" +
      "<p>A ratio that varies but a hue difference under 10° means the pair is <b>merged</b> (two-colour " +
      "look).</p>",
   target: "<p><b>Target colour</b> (hue in degrees: 0 red, 30 orange, 50 gold, 60 yellow, 120 green, " +
      "180 cyan, 240 blue, 300 magenta). Areas where this line is stronger are pulled toward this hue. The " +
      "swatch shows the colour.</p><p>Leaving the target on the current colour changes nothing.</p>",
   force: "<p><b>Strength</b>: how far the areas of this line move toward the target. 0 = line inactive (the " +
      "target has no effect), 1 = part of the way, 2 to 3 = nearly all the way. A pixel never goes past the " +
      "target.</p><p>Changing the target or tolerance of an inactive line sets its strength to 1 automatically.</p>",
   tol: "<p><b>Tolerance</b> (degrees): which current colours are allowed to move. Only pixels whose hue is " +
      "within this distance of the line's current colour are affected, with an effect that fades with " +
      "distance.</p><p>This is what protects areas of another colour (a blue OIII nebula does not move while " +
      "you adjust SII and Ha).</p>",
   sat: "<p><b>Saturation</b> of the colour in the areas of this line: 1 = unchanged, 1.3 = 30 % stronger, " +
      "0.8 = softer. Brightness does not change. If a colour falls outside the displayable range, the guard " +
      "limits it.</p>",
   fine: "<p><b>Fine slider</b>: a zoom around the value of the slider above, for precise adjustment. It " +
      "re-centres when you release the mouse or when the value changes elsewhere. You can also type the value " +
      "in the box.</p>",
   p3preset: "<p><b>Pass 3: palette (cosmetic, optional).</b> Once the lines are separated (pass 2), each " +
      "colour family (one per line) is rotated as a whole toward the hue of the chosen palette. The " +
      "separation is kept, only the colours change. Nothing moves in the background.</p>" +
      "<p><b>None</b>: pass 3 off. <b>True colours</b>: hues computed from the emission wavelengths (SII and Ha " +
      "give the same red, OIII a green-teal). <b>Custom</b>: your own hues; editing a hue switches to Custom " +
      "automatically.</p>",
   p3hue: "<p><b>Palette hue</b> for the family of this line (degrees: 0 red, 30 orange, 50 gold, 60 yellow, " +
      "120 green, 180 cyan, 240 blue, 300 magenta). The swatch shows the colour.</p>",
   p3sat: "<p><b>Palette saturation</b>: 1 = unchanged, below 1 = softer colours (mineral palette), above 1 = " +
      "stronger. Only affects signal areas.</p>",
   p3amt: "<p><b>Palette intensity</b>: 1 = palette hues reached, 0.5 = halfway between the pass 2 result and " +
      "the palette, 0 = pass 3 has no effect.</p>",
   lang: "<p>Interface language. The dialog reopens right away in the chosen language, keeping the analysis " +
      "and settings. The choice is remembered.</p><p>Langue de l'interface. Le dialogue se rouvre dans la " +
      "langue choisie, en gardant l'analyse et les réglages.</p>",
   blurLines: "<p><b>Line smoothing</b> (StdDev in full-resolution pixels) before comparing line ratios, so " +
      "that noise does not decide. Validated: 20 px on Cassiopeia (2.9\"/px).</p>",
   blurMap: "<p><b>Map smoothing</b> (px): softness of the transitions between areas of different lines. " +
      "Validated: 10 px.</p>",
   blurColor: "<p><b>Current colour smoothing</b> (px) used for the tolerance, so that colour noise does not " +
      "decide. Validated: 5 px.</p>",
   split: "<p><b>Proposed split</b> (degrees): when a pair is merged, the proposal places its two lines at ± " +
      "this value around their common colour.</p>",
   sigPct: "<p><b>Signal threshold</b>: percentile of the total signal above which the effect is complete. " +
      "Below it, the effect fades to zero on the background. Higher = effect limited to strong areas. " +
      "Validated: 60.</p>",
   bg: "<p><b>Sky background of each linear master</b>. Auto = peak of the 16-bit histogram (0.145022 on " +
      "Cassiopeia). <b>Sensitive setting</b>: the compared signals are of the order of 0.00001.</p>",
   weights: "<p><b>Levelling</b> of SII and OIII to Ha. Auto = median of Ha / median of the master, in the 30 % " +
      "of pixels where Ha is strongest (SII x2.46, OIII x6.06 on Cassiopeia).</p>",
   auto: "<p>Checked: computed at each analysis and shown here. Unchecked: the value you type is used.</p>",
   advanced: "<p>Shows the analysis settings (smoothing, backgrounds, weights).</p>",
   before: "<p>Shows the original image in the preview, for comparison.</p>",
   refresh: "<p>Recomputes the preview now. Runs the analysis first if it has not been done or if an advanced " +
      "setting changed.</p>",
   fitB: "<p>Preview fitted to the window. Wheel: zoom. Drag: pan.</p>",
   oneB: "<p>Preview at 100 % of the working image (reduced, about 1,200 pixels wide).</p>",
   newInstance: "<p><b>New instance.</b> Drag this triangle to the workspace to create an icon with all the " +
      "settings (palette included) and the names of the four images. Double-click: reopens this dialog with " +
      "those settings. Drag the icon onto the final image: applies directly.</p>",
   reset: "<p>Back to the default settings. The next analysis will make a new proposal.</p>",
   apply: "<p>Applies at full resolution and creates &lt;final image&gt;_mix. The console reports the " +
      "settings, the number of changed pixels, the maximum luminance difference and the number of newly " +
      "clipped pixels.</p>",
   close: "<p>Close. The last settings are remembered.</p>"
   };
}

function MixDialog()
{
   this.__base__ = Dialog;
   this.__base__();
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
   // Il se recentre quand on relâche la souris ou quand la valeur change ailleurs.
   this.makeFine = function( key, span, prec, onChange, lw )
   {
      var steps = 400;
      var lab = new Label( self );
      lab.text = L( "fin ±", "fine ±" ) + ( span < 1 ? format( "%.2f", span ) : format( "%.0f", span ) );
      lab.minWidth = lw ? lw : labelWidth;
      lab.textAlignment = TextAlign_Right | TextAlign_VertCenter;
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
   var live = function( key )
   {
      for ( var i = 0; i < 3; ++i )
         if ( ( key == T_KEYS[i] || key == W_KEYS[i] ) && TP[F_KEYS[i]] <= 0 )
         {
            TP[F_KEYS[i]] = 1;
            self.numeric[F_KEYS[i]].setValue( 1 );
            console.writeln( LINES[i] + L( " : force passée de 0 à 1 pour que la cible agisse.",
                                           ": strength set from 0 to 1 so that the target takes effect." ) );
         }
      self.updateSwatches();
      self.schedulePreview();
   };

   // --- Images -----------------------------------------------------------
   this.makeViewRow = function( text, key, tip )
   {
      var lab = new Label( self );
      lab.text = text;
      lab.minWidth = labelWidth;
      lab.maxWidth = labelWidth;
      lab.textAlignment = TextAlign_Right | TextAlign_VertCenter;
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

   this.paletteLabel = new Label( this );
   this.paletteLabel.text = L( "Ordre R, V, B :", "R, G, B order:" );
   this.paletteLabel.minWidth = labelWidth;
   this.paletteLabel.maxWidth = labelWidth;
   this.paletteLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.paletteLabel.toolTip = TIPS.palette;
   this.paletteCombo = new ComboBox( this );
   for ( var i = 0; i < PALETTES.length; ++i )
      this.paletteCombo.addItem( PALETTES[i] );
   this.paletteCombo.currentItem = TP.palette;
   this.paletteCombo.toolTip = TIPS.palette;
   this.paletteCombo.onItemSelected = function( idx ) { TP.palette = idx; };
   var palRow = new HorizontalSizer;
   palRow.spacing = 4;
   palRow.add( this.paletteLabel );
   palRow.add( this.paletteCombo );
   palRow.addStretch();

   this.viewsGroup = new GroupBox( this );
   this.viewsGroup.title = L( "Images", "Images" );
   this.viewsGroup.sizer = new VerticalSizer;
   this.viewsGroup.sizer.margin = 6;
   this.viewsGroup.sizer.spacing = 4;
   this.viewsGroup.sizer.add( this.rowS.sizer );
   this.viewsGroup.sizer.add( this.rowH.sizer );
   this.viewsGroup.sizer.add( this.rowO.sizer );
   this.viewsGroup.sizer.add( this.rowT.sizer );
   this.viewsGroup.sizer.add( palRow );

   // --- Analyse ------------------------------------------------------------
   this.analyseButton = new PushButton( this );
   this.analyseButton.text = L( "Analyser", "Analyse" );
   this.analyseButton.toolTip = TIPS.analyse;
   this.analyseButton.onClick = function() { self.runAnalysis(); };

   this.proposeButton = new PushButton( this );
   this.proposeButton.text = L( "Proposition", "Proposal" );
   this.proposeButton.toolTip = TIPS.propose;
   this.proposeButton.onClick = function()
   {
      if ( !self.ensureAnalysis() ) return;
      propose( TP, ANA );
      self.refreshFromTP();
      self.refreshPreview();
   };

   this.mapButton = new PushButton( this );
   this.mapButton.text = L( "Carte des raies", "Line map" );
   this.mapButton.toolTip = TIPS.map;
   this.mapButton.onClick = function()
   {
      if ( !self.ensureAnalysis() ) return;
      try
      {
         showLineMap( ANA );
      }
      catch ( e )
      {
         reportError( L( "carte", "line map" ), e );
         self.statusLabel.text = L( "<b>Erreur carte :</b> ", "<b>Line map error:</b> " ) + errText( e );
      }
   };

   var aRow = new HorizontalSizer;
   aRow.spacing = 6;
   aRow.add( this.analyseButton );
   aRow.add( this.proposeButton );
   aRow.add( this.mapButton );
   aRow.addStretch();

   this.diagLabel = new Label( this );
   this.diagLabel.useRichText = true;
   this.diagLabel.wordWrapping = true;
   this.diagLabel.toolTip = TIPS.diag;
   this.diagLabel.text = L( "<p><i>Pas encore d'analyse.</i></p>", "<p><i>No analysis yet.</i></p>" );

   this.analyseGroup = new GroupBox( this );
   this.analyseGroup.title = L( "Passe 1 : analyse des raies", "Pass 1: line analysis" );
   this.analyseGroup.sizer = new VerticalSizer;
   this.analyseGroup.sizer.margin = 6;
   this.analyseGroup.sizer.spacing = 6;
   this.analyseGroup.sizer.add( aRow );
   this.analyseGroup.sizer.add( this.diagLabel );

   // --- Avancé ----------------------------------------------------------------
   this.advCheck = this.makeCheck( L( "Réglages avancés", "Advanced settings" ), "showAdvanced", TIPS.advanced, function()
   {
      if ( TP.showAdvanced ) self.advGroup.show(); else self.advGroup.hide();
      self.adjustToContents();
   } );
   this.advGroup = new GroupBox( this );
   this.advGroup.title = L( "Réglages avancés de l'analyse", "Advanced analysis settings" );
   this.advGroup.sizer = new VerticalSizer;
   this.advGroup.sizer.margin = 6;
   this.advGroup.sizer.spacing = 4;
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage des raies (px) :", "Line smoothing (px):" ), "blurLines", 0, 60, 1, TIPS.blurLines, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage des cartes (px) :", "Map smoothing (px):" ), "blurMap", 0, 40, 1, TIPS.blurMap, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Lissage couleur (px) :", "Colour smoothing (px):" ), "blurColor", 0, 20, 1, TIPS.blurColor, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Seuil de signal :", "Signal threshold:" ), "sigPct", 5, 95, 0, TIPS.sigPct, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Écart proposé (°) :", "Proposed split (°):" ), "split", 0, 90, 0, TIPS.split ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond SII :", "SII background:" ), "bgS", 0, 1, 6, TIPS.bg, stale ), "autoBg" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond Ha :", "Ha background:" ), "bgH", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Fond OIII :", "OIII background:" ), "bgO", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Poids SII :", "SII weight:" ), "kS", 0.01, 100, 3, TIPS.weights, stale ), "autoWeights" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( L( "Poids OIII :", "OIII weight:" ), "kO", 0.01, 100, 3, TIPS.weights, stale ) ) );

   // --- Passe 3 : palette ------------------------------------------------------
   var p3edit = function()
   {
      if ( TP.p3Preset != P3_CUSTOM )
      {
         TP.p3Preset = P3_CUSTOM;
         self.p3Combo.currentItem = P3_CUSTOM;
      }
      self.updateSwatches();
      self.schedulePreview();
   };
   var p3live = function() { self.schedulePreview(); };
   this.p3Label = new Label( this );
   this.p3Label.text = L( "Préréglage :", "Preset:" );
   this.p3Label.minWidth = labelWidth;
   this.p3Label.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   this.p3Label.toolTip = TIPS.p3preset;
   this.p3Combo = new ComboBox( this );
   for ( var i = 0; i < P3_PRESETS.length; ++i )
      this.p3Combo.addItem( p3Name( i ) );
   this.p3Combo.currentItem = TP.p3Preset;
   this.p3Combo.toolTip = TIPS.p3preset;
   this.p3Combo.onItemSelected = function( idx )
   {
      applyP3Preset( TP, idx );
      self.refreshFromTP();
      self.schedulePreview();
   };
   var p3Row = new HorizontalSizer;
   p3Row.spacing = 4;
   p3Row.add( this.p3Label );
   p3Row.add( this.p3Combo, 100 );
   this.p3Group = new GroupBox( this );
   this.p3Group.title = L( "Passe 3 : palette (cosmétique, facultative)", "Pass 3: palette (cosmetic, optional)" );
   this.p3Group.sizer = new VerticalSizer;
   this.p3Group.sizer.margin = 6;
   this.p3Group.sizer.spacing = 4;
   this.p3Group.sizer.add( p3Row );
   this.p3Swatch = [];
   for ( var i = 0; i < 3; ++i )
   {
      var sw3 = new Label( this );
      sw3.setFixedSize( 24, 18 );
      sw3.toolTip = TIPS.p3hue;
      this.p3Swatch.push( sw3 );
      var hr = new HorizontalSizer;
      hr.spacing = 4;
      hr.add( this.makeNumeric( LINES[i] + " (°) :", P3_KEYS[i], 0, 360, 1, TIPS.p3hue, p3edit, labelWidth - 28 ), 100 );
      hr.add( sw3 );
      this.p3Group.sizer.add( hr );
      this.p3Group.sizer.add( this.makeFine( P3_KEYS[i], 15, 1, p3edit, labelWidth - 28 ) );
   }
   this.p3Group.sizer.add( this.makeNumeric( L( "Saturation :", "Saturation:" ), "p3Sat", 0.2, 1.5, 2, TIPS.p3sat, p3live ) );
   this.p3Group.sizer.add( this.makeFine( "p3Sat", 0.2, 2, p3live ) );
   this.p3Group.sizer.add( this.makeNumeric( L( "Intensité :", "Intensity:" ), "p3Amt", 0, 1, 2, TIPS.p3amt, p3live ) );

   // --- Colonne de gauche --------------------------------------------------------
   this.helpLabel = new Label( this );
   this.helpLabel.useRichText = true;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.text = L(
      "<p><b>" + TITLE + " " + VERSION + " (PI 1.9.3)</b> : donne à chaque raie sa couleur. " +
      "Seule la teinte change, la luminosité reste celle de ton image.</p>" +
      "<p><i>Les trois couches linéaires servent seulement à repérer où chaque raie domine ; " +
      "c'est l'image finale étirée qui change de couleur.</i></p>" +
      "<p><i>1. Choisir les quatre images, 2. Analyser (10 à 30 s), 3. régler les couleurs avec l'aperçu, " +
      "4. si tu veux, choisir une palette (passe 3), 5. Appliquer. " +
      "Passer la souris sur un réglage pour son explication.</i></p>",
      "<p><b>" + TITLE + " " + VERSION + " (PI 1.9.3)</b> gives each emission line its own colour. " +
      "Only the hue changes; the brightness of your image is kept.</p>" +
      "<p><i>The three linear masters are only used to locate where each line dominates; " +
      "the colours are changed on the final stretched image.</i></p>" +
      "<p><i>1. Select the four images, 2. Analyse (10 to 30 s), 3. adjust the colours with the preview, " +
      "4. optionally pick a palette (pass 3), 5. Apply. " +
      "Hover over any setting for an explanation.</i></p>" );

   this.langLabel = new Label( this );
   this.langLabel.text = "Langue / Language :";
   this.langLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
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
      if ( self.timer )
         self.timer.stop();
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
   this.leftColumn.sizer.add( langRow );
   this.leftColumn.sizer.add( this.helpLabel );
   this.leftColumn.sizer.add( this.viewsGroup );
   this.leftColumn.sizer.add( this.analyseGroup );
   this.leftColumn.sizer.add( this.p3Group );
   this.leftColumn.sizer.add( this.advCheck );
   this.leftColumn.sizer.add( this.advGroup );
   this.leftColumn.sizer.addStretch();
   this.leftColumn.setMinWidth( this.logicalPixelsToPhysical( 430 ) );

   // --- Raies (passe 2) ------------------------------------------------------------
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
      fl.textAlignment = TextAlign_Left | TextAlign_VertCenter;
      this.famLabel.push( fl );
      var top = new HorizontalSizer;
      top.spacing = 6;
      top.add( sw );
      top.add( fl, 100 );
      grp.sizer.add( top );
      grp.sizer.add( this.makeNumeric( L( "Cible (°) :", "Target (°):" ), T_KEYS[i], 0, 360, 1, TIPS.target, live, lw2 ) );
      grp.sizer.add( this.makeFine( T_KEYS[i], 15, 1, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Force :", "Strength:" ), F_KEYS[i], 0, 3, 2, TIPS.force, live, lw2 ) );
      grp.sizer.add( this.makeFine( F_KEYS[i], 0.3, 2, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Tolérance (°) :", "Tolerance (°):" ), W_KEYS[i], 5, 120, 0, TIPS.tol, live, lw2 ) );
      grp.sizer.add( this.makeFine( W_KEYS[i], 10, 0, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( L( "Saturation :", "Saturation:" ), SAT_KEYS[i], 0.5, 2, 2, TIPS.sat, live, lw2 ) );
      grp.sizer.add( this.makeFine( SAT_KEYS[i], 0.2, 2, live, lw2 ) );
      this.lineGroups.push( grp );
   }
   var linesRow = new HorizontalSizer;
   linesRow.spacing = 6;
   for ( var i = 0; i < 3; ++i )
      linesRow.add( this.lineGroups[i], 100 );

   // --- Aperçu ---------------------------------------------------------------------------
   this.previewBox = new PreviewBox( this );
   this.previewBox.setMinWidth( this.logicalPixelsToPhysical( 640 ) );
   this.previewBox.setMinHeight( this.logicalPixelsToPhysical( 420 ) );

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
   this.statusLabel.textAlignment = TextAlign_Right | TextAlign_VertCenter;
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
   try { this.newInstanceButton.setScaledFixedSize( 20, 20 ); } catch ( e ) { this.newInstanceButton.setFixedSize( 20, 20 ); }
   this.newInstanceButton.toolTip = TIPS.newInstance;
   this.newInstanceButton.onMousePress = function()
   {
      this.hasFocus = true;
      saveParameters();
      this.pushed = false;
      this.dialog.newInstance();
   };

   this.resetButton = new ToolButton( this );
   this.resetButton.icon = this.scaledResource( ":/process-interface/reset.png" );
   try { this.resetButton.setScaledFixedSize( 20, 20 ); } catch ( e ) { this.resetButton.setFixedSize( 20, 20 ); }
   this.resetButton.toolTip = TIPS.reset;
   this.resetButton.onClick = function()
   {
      var ids = { sId: TP.sId, hId: TP.hId, oId: TP.oId, tId: TP.tId };
      resetTP();
      for ( var key in ids )
         TP[key] = ids[key];
      if ( ANA != null )
         propose( TP, ANA );
      self.refreshFromTP();
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
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon_Error, StdButton_Ok ) ).execute();
      }
      self.applyButton.enabled = true;
   };

   this.closeButton = new PushButton( this );
   this.closeButton.text = L( "Fermer", "Close" );
   this.closeButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.closeButton.toolTip = TIPS.close;
   this.closeButton.onClick = function()
   {
      if ( self.timer )
         self.timer.stop();
      saveSettings();
      self.ok();
   };

   var bRow = new HorizontalSizer;
   bRow.spacing = 6;
   bRow.add( this.newInstanceButton );
   bRow.add( this.resetButton );
   bRow.addStretch();
   bRow.add( this.applyButton );
   bRow.add( this.closeButton );

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( mainRow, 100 );
   this.sizer.add( bRow );

   // --- Comportement ---------------------------------------------------------------------
   this.timer = null;
   try
   {
      this.timer = new Timer;
      this.timer.periodic = false;
      this.timer.interval = 0.3;
      this.timer.onTimeout = function() { self.refreshPreview(); };
   }
   catch ( e )
   {
      this.timer = null;
   }

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
      if ( self.timer )
      {
         self.timer.stop();
         self.timer.start();
      }
      else
         self.refreshPreview();
   };

   this.markStale = function()
   {
      if ( ANA != null && ANA.key != analysisKey( TP ) )
         self.statusLabel.text = L( "<i>Analyse à refaire : clique sur Rafraîchir</i>", "<i>Analysis out of date: click Refresh</i>" );
   };

   this.updateSwatches = function()
   {
      for ( var i = 0; i < 3; ++i )
      {
         self.swatch[i].styleSheet = "QLabel { background-color: " + hexOfHue( TP[T_KEYS[i]] ) +
                                     "; border: 1px solid #777777; }";
         self.p3Swatch[i].styleSheet = "QLabel { background-color: " + hexOfHue( TP[P3_KEYS[i]] ) +
                                       "; border: 1px solid #777777; }";
      }
   };

   this.updateEnabled = function()
   {
      var a = !TP.autoBg, b = !TP.autoWeights;
      self.numeric.bgS.enabled = a;
      self.numeric.bgH.enabled = a;
      self.numeric.bgO.enabled = a;
      self.numeric.kS.enabled = b;
      self.numeric.kO.enabled = b;
      var c3 = TP.p3Preset > 0;
      for ( var i = 0; i < 3; ++i )
         self.numeric[P3_KEYS[i]].enabled = c3;
      self.numeric.p3Sat.enabled = c3;
      self.numeric.p3Amt.enabled = c3;
      for ( var key in self.fine )
         if ( key.indexOf( "p3" ) == 0 )
            self.fine[key].slider.enabled = c3;
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
      for ( var i = 0; i < 3; ++i )
         self.famLabel[i].text = format( L( "couleur actuelle : %.0f°", "current colour: %.0f°" ), ANA.fam[i] );
   };

   this.refreshFromTP = function()
   {
      for ( var key in self.numeric )
         self.numeric[key].setValue( TP[key] );
      for ( var key in self.fine )
         self.fine[key].recenter();
      self.p3Combo.currentItem = TP.p3Preset;
      for ( var key in self.checks )
         self.checks[key].checked = TP[key];
      self.paletteCombo.currentItem = TP.palette;
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
      pumpEvents();
      var t0 = Date.now(), ok = false;
      try
      {
         console.show();
         ANA = null;
         analyse( TP );
         if ( !TP.targetsSet )
            propose( TP, ANA );
         self.beforeBitmap = null;
         self.refreshFromTP();
         ok = true;
      }
      catch ( e )
      {
         ANA = null;
         reportError( L( "analyse", "analysis" ), e );
         self.statusLabel.text = L( "<b>Erreur d'analyse :</b> ", "<b>Analysis error:</b> " ) + errText( e );
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon_Error, StdButton_Ok ) ).execute();
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
               freeImage( ib );
            }
            bmp = self.beforeBitmap;
         }
         else
         {
            var st = [ 0, 0, 0 ];
            var im = previewImage( TP, ANA, false, st );
            bmp = im.render();
            freeImage( im );
            var npx = ANA.ww * ANA.wh;
            for ( var i = 0; i < 3; ++i )
               self.famLabel[i].text = format( L( "actuelle %.0f° | ", "current %.0f° | " ), ANA.fam[i] ) +
                  ( ( TP[F_KEYS[i]] <= 0 && TP[SAT_KEYS[i]] == 1 ) ? L( "inactive (force 0)", "inactive (strength 0)" ) :
                    format( L( "agit sur %.1f %% de l'image", "acts on %.1f %% of the image" ), 100 * st[i] / npx ) );
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
   this.adjustToContents();
   this.setMinWidth( this.logicalPixelsToPhysical( 1200 ) );
   this.setMinHeight( this.logicalPixelsToPhysical( 820 ) );
}
MixDialog.prototype = new Dialog;

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
         if ( !TP.targetsSet )
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
      loadSettings();
   for ( ;; )
   {
      TIPS = buildTips();
      var dialog = new MixDialog();
      dialog.execute();
      if ( !dialog.relaunch )
         break;
   }
   ANA = null;
}

main();
