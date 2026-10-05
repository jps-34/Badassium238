#engine v8

#feature-id    Badassium238 : Utilities > Badassium238
#feature-info  Analyse quelles raies (SII, Ha, OIII) sortent de la meme couleur dans l'image \
   finale, puis donne a chaque raie sa couleur cible par rotation de teinte a luminosite \
   constante, avec apercu. Cree une copie, ne modifie jamais l'image d'origine.

/*
 * Badassium238.js  v1.0.3
 * Copyright (c) 2026 Jacques Pouyaud. MIT License (see LICENSE).
 * Code écrit par Claude (Anthropic), sous la direction de Jacques Pouyaud.
 * https://github.com/jps-34/Badassium238
 * (ex-TrichromieSHO ; v1.0.3 = renommage seul, calculs identiques a la v1.0.2)
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
 * L'image d'origine et les couches ne sont jamais modifiées : le résultat est
 * une nouvelle image <id>_mix.
 *
 * API PJSR V8 (PixInsight 1.9.4) : motifs repris des scripts V8
 * PhotometricContinuumSubtraction / ApplySTF (Charles Hagen) et
 * VeraLux HyperMetric Stretch / GAME (portages V8 de salvolm84).
 * ----------------------------------------------------------------------------
 */

CoreApplication.ensureMinimumVersion( 1, 9, 4 );

var TITLE   = "Badassium238";
var VERSION = "1.0.3";
var SETTINGS_KEY = "Badassium238/settings";
var OLD_SETTINGS_KEY = "TrichromieSHO/settings";
var LINES = [ "SII", "Ha", "OIII" ];
var PALETTES = [ "SHO", "SOH", "HSO", "HOS", "OSH", "OHS" ];
var LETTER = [ "S", "H", "O" ];

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
   showAdvanced: false
};

var STR_KEYS  = [ "sId", "hId", "oId", "tId" ];
var BOOL_KEYS = [ "autoBg", "autoWeights", "targetsSet", "showAdvanced" ];
var REAL_KEYS = [ "palette", "blurLines", "blurMap", "blurColor", "split", "sigPct",
                  "bgS", "bgH", "bgO", "kS", "kO" ].concat( T_KEYS, F_KEYS, W_KEYS, SAT_KEYS );

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
      Settings.write( SETTINGS_KEY, DataType.String, JSON.stringify( TP ) );
   }
   catch ( e ) {}
}

function loadSettings()
{
   try
   {
      var s = Settings.read( SETTINGS_KEY, DataType.String );
      if ( s == null || s.length == 0 )
      {
         // réglages mémorisés sous l'ancien nom (TrichromieSHO)
         try { s = Settings.read( OLD_SETTINGS_KEY, DataType.String ); } catch ( e2 ) { s = null; }
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
      throw new Error( "Copie de " + srcView.id + " impossible" );
   var v = findView( newId );
   if ( v == null )
      throw new Error( "Copie " + newId + " introuvable" );
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
   pass( src, tmp, w, h, w, 1 );     // lignes
   pass( tmp, dst, h, w, 1, w );     // colonnes
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
      throw userError( "Choisir les trois couches linéaires SII, Ha et OIII." );
   if ( T == null )
      throw userError( "Choisir l'image finale étirée." );
   var lines = [ S, H, O ];
   for ( var i = 0; i < 3; ++i )
      if ( lines[i].image.isColor )
         throw userError( lines[i].id + " est en couleur : il faut une couche en niveaux de gris." );
   if ( !T.image.isColor )
      throw userError( T.id + " n'est pas une image RVB." );
   var w = T.image.width, h = T.image.height;
   for ( var i = 0; i < 3; ++i )
      if ( lines[i].image.width != w || lines[i].image.height != h )
         throw userError( lines[i].id + " (" + lines[i].image.width + "x" + lines[i].image.height +
            ") n'a pas les dimensions de " + T.id + " (" + w + "x" + h + "). " +
            "Les couches doivent être alignées pixel à pixel avec l'image finale." );
   return { S: S, H: H, O: O, T: T };
}

function analyse( p )
{
   var t0 = Date.now();
   var v = checkInputs( p );
   var W = v.T.image.width, H = v.T.image.height;
   var s = Math.max( 1, Math.round( Math.max( W, H ) / 1800 ) );
   var ww = Math.ceil( W / s ), wh = Math.ceil( H / s ), n = ww * wh;
   log( "<b>" + TITLE + " : analyse</b> (" + W + "x" + H + ", travail en " + ww + "x" + wh + ")" );

   // Lecture des couches (copies) : moyennes par blocs + histogrammes 16 bits
   var raw = [], hists = [];
   var srcLines = [ v.S, v.H, v.O ];
   for ( var i = 0; i < 3; ++i )
   {
      log( "  lecture de " + LINES[i] + " (" + srcLines[i].id + ")" );
      CoreApplication.processEvents();
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
   log( "  lecture de l'image finale (" + v.T.id + ")" );
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
         throw userError( "Poids auto impossibles (signal nul au-dessus du fond). Vérifier les fonds." );
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
      throw userError( "Aucun signal Ha au-dessus du fond : fond Ha trop haut ?" );
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
         D.verdict = "pas assez de signal";
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
      D.verdict = D.confused ? "confondues" : ( Math.abs( D.sep ) >= 25 ? "bien séparées" : "en partie séparées" );
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

   ANA = {
      key: analysisKey( p ), W: W, H: H, s: s, ww: ww, wh: wh,
      fr: fr, fg: fg, fb: fb, ch: ch, ys: ys, cb: cb, cr: cr,
      diag: diag, fam: fam, famSpread: famSpread, inPair: inPair, bg: bg, kS: p.kS, kO: p.kO
   };

   log( format( "  Fonds : SII %.6f  Ha %.6f  OIII %.6f%s | poids : SII x%.3f  OIII x%.3f%s",
        p.bgS, p.bgH, p.bgO, p.autoBg ? " (auto)" : "", p.kS, p.kO, p.autoWeights ? " (auto)" : "" ) );
   for ( var q = 0; q < 3; ++q )
   {
      var D = diag[q];
      if ( D.p10 === undefined )
         log( "  " + LINES[D.a] + "/" + LINES[D.b] + " : " + D.verdict );
      else
         log( format( "  %s/%s : partagent %.0f%% du signal | rapport de %+.2f à %+.2f | écart de teinte %.0f° -> %s",
              LINES[D.a], LINES[D.b], D.overlap, D.p10, D.p90, Math.abs( D.sep ), D.verdict ) );
   }
   log( format( "  Couleur actuelle : SII %.0f° (±%.0f°)  Ha %.0f° (±%.0f°)  OIII %.0f° (±%.0f°)",
        fam[0], famSpread[0], fam[1], famSpread[1], fam[2], famSpread[2] ) );
   log( format( "  Analyse en %.1f s", ( Date.now() - t0 ) / 1000 ) );
   return ANA;
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
   var L = [];
   for ( var i = 0; i < 3; ++i )
      L.push( {
         active: p[F_KEYS[i]] > 0 || p[SAT_KEYS[i]] != 1,
         force: p[F_KEYS[i]],
         fam: ana.fam[i],
         tol: Math.max( 1, p[W_KEYS[i]] ),
         phi: ycAngleOfHue( p[T_KEYS[i]] ),
         sat: p[SAT_KEYS[i]]
      } );
   return L;
}

// Calcule la nouvelle couleur d'un pixel. out = [r, g, b]. Retourne true si modifié.
function mixPixel( r, g, b, c0, c1, c2, ys, cbs, crs, P, out, st )
{
   out[0] = r; out[1] = g; out[2] = b;
   if ( c0 < 1e-5 && c1 < 1e-5 && c2 < 1e-5 )
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
      var L = P[i];
      if ( !L.active )
         continue;
      var close = 1 - Math.abs( wrapDeg( hs - L.fam ) ) / L.tol;
      if ( close <= 0 )
         continue;
      var w = Math.min( 1, L.force * c[i] );
      if ( L.force <= 0 )
         w = Math.min( 1, c[i] );          // saturation seule : dosée par le caractère
      a[i] = w * close;
      A += a[i];
   }
   if ( A <= 1e-6 )
      return false;
   if ( A > 1 )
   {
      for ( var i = 0; i < 3; ++i )
         a[i] /= A;
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

// Mélange sur l'image de travail (aperçu). Retourne une Image RVB 32 bits.
function previewImage( p, ana, before, st )
{
   var ww = ana.ww, wh = ana.wh, n = ww * wh;
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
                      ana.ys[j], ana.cb[j], ana.cr[j], P, out, st );
         rr[x] = out[0]; rg[x] = out[1]; rb[x] = out[2];
      }
   }
   return img;
}

// Image des cartes de raies : rouge = SII, vert = Ha, bleu = OIII (caractère de chaque raie).
function showLineMap( ana )
{
   var ww = ana.ww, wh = ana.wh;
   var img = new Image( ww, wh, 3, ColorSpace.RGB, 32, PixelSampleType.Float );
   for ( var c = 0; c < 3; ++c )
   {
      var I = new ImageIterator( img, c ), src = ana.ch[c];
      for ( var y = 0; y < wh; ++y )
      {
         var row = I[y];
         for ( var x = 0; x < ww; ++x )
            row[x] = clamp( src[y * ww + x], 0, 1 );
      }
   }
   var win = new ImageWindow( ww, wh, 3, 32, true, true, validId( "B238_carte_raies" ) );
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
   log( "<b>" + TITLE + " : application en pleine résolution</b>" );
   var P = mixParams( p, ana ), out = [ 0, 0, 0 ];
   var src = floatCopy( v.T, validId( "B238_tmp" ) );
   var res = new Image( W, H, 3, ColorSpace.RGB, 32, PixelSampleType.Float );
   var nChanged = 0, nNewClip = 0, maxDY = 0;
   try
   {
      var Ir = new ImageIterator( src.image, 0 ), Ig = new ImageIterator( src.image, 1 ), Ib = new ImageIterator( src.image, 2 );
      var Or = new ImageIterator( res, 0 ), Og = new ImageIterator( res, 1 ), Ob = new ImageIterator( res, 2 );
      var maps = [ ana.ch[0], ana.ch[1], ana.ch[2], ana.ys, ana.cb, ana.cr ], mv = new Float64Array( 6 );
      for ( var y = 0; y < H; ++y )
      {
         var fy = clamp( ( y + 0.5 ) / s - 0.5, 0, wh - 1 ), y0 = Math.floor( fy ), y1 = Math.min( y0 + 1, wh - 1 ), ty = fy - y0;
         var sr = Ir[y], sg = Ig[y], sb = Ib[y], rr = Or[y], rg = Og[y], rb = Ob[y];
         for ( var x = 0; x < W; ++x )
         {
            var fx = clamp( ( x + 0.5 ) / s - 0.5, 0, ww - 1 ), x0 = Math.floor( fx ), x1 = Math.min( x0 + 1, ww - 1 ), tx = fx - x0;
            var r = sr[x], g = sg[x], b = sb[x];
            mv[0] = bilin( maps[0], ww, wh, x0, x1, tx, y0, y1, ty );
            mv[1] = bilin( maps[1], ww, wh, x0, x1, tx, y0, y1, ty );
            mv[2] = bilin( maps[2], ww, wh, x0, x1, tx, y0, y1, ty );
            if ( mv[0] < 1e-5 && mv[1] < 1e-5 && mv[2] < 1e-5 )
            {
               rr[x] = r; rg[x] = g; rb[x] = b;
               continue;
            }
            for ( var k = 3; k < 6; ++k )
               mv[k] = bilin( maps[k], ww, wh, x0, x1, tx, y0, y1, ty );
            if ( mixPixel( r, g, b, mv[0], mv[1], mv[2], mv[3], mv[4], mv[5], P, out ) )
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

   log( "<b>Réglages</b> (palette " + PALETTES[p.palette] + ")" );
   for ( var i = 0; i < 3; ++i )
      log( format( "  %-4s couleur actuelle %3.0f° -> cible %3.0f° | force %.2f | tolérance %.0f° | saturation %.2f",
           LINES[i], ana.fam[i], p[T_KEYS[i]], p[F_KEYS[i]], p[W_KEYS[i]], p[SAT_KEYS[i]] ) );
   log( format( "  Pixels dont la couleur a bougé : %.1f %% | écart de luminance maximal : %.5f | nouveaux pixels écrêtés : %d",
        100 * nChanged / ( W * H ), maxDY, nNewClip ) );
   log( format( "Résultat : <b>%s</b> (%.1f s)", id, ( Date.now() - t0 ) / 1000 ) );
   win.show();
   win.zoomToFit();
   return win.mainView;
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

var TIPS = {
   s: "<p><b>SII linéaire sans étoiles</b> (niveaux de gris), telle quelle, sans étirement : par exemple " +
      "SII_starless_noisX. Elle sert uniquement à savoir où le SII est présent. Elle n'est pas modifiée.</p>",
   h: "<p><b>Ha linéaire sans étoiles</b> (niveaux de gris), telle quelle. Non modifiée.</p>",
   o: "<p><b>OIII linéaire sans étoiles</b> (niveaux de gris), telle quelle. Non modifiée.</p>",
   t: "<p><b>Image finale étirée</b> (RVB), celle dont on change les couleurs. Elle n'est pas modifiée : " +
      "le résultat est une copie &lt;id&gt;_mix.</p><p>Elle doit être alignée pixel à pixel avec les " +
      "trois couches (pas de recadrage ni de rotation entre les deux).</p>",
   palette: "<p><b>Palette de l'image finale</b> : quelle raie est dans le rouge, le vert, le bleu. " +
      "Sert seulement à proposer le sens de séparation d'une paire confondue : la raie du canal le plus " +
      "rouge part vers le rouge, l'autre vers le jaune. SHO : SII rouge, Ha vert, OIII bleu.</p>",
   analyse: "<p><b>Passe 1.</b> Lit les quatre images (copies), mesure pour chaque paire de raies si leur " +
      "rapport change la couleur de l'image finale, et prépare les cartes pour l'aperçu. À refaire si on " +
      "change une image ou un réglage avancé.</p><p>La première analyse propose aussi les réglages. Ensuite " +
      "tes réglages sont gardés (même d'une session à l'autre) : bouton Proposition pour revenir à la " +
      "proposition, par exemple sur un nouvel objet.</p>",
   propose: "<p>Lance l'analyse si besoin, puis remet les couleurs cibles, forces, tolérances et saturations proposées par l'analyse : " +
      "chaque raie sur sa couleur actuelle (aucun changement), et pour chaque paire confondue, les deux " +
      "raies écartées de part et d'autre de leur couleur commune.</p>",
   map: "<p>Lance l'analyse si besoin, puis ouvre l'image des cartes utilisées, à la taille de travail : rouge = où le SII est plus fort " +
      "que d'habitude, vert = Ha, bleu = OIII. Noir = rien ne bougera (fond, signal trop faible).</p>",
   diag: "<p><b>Diagnostic des paires.</b> Partage : part du signal où les deux raies sont ensemble. " +
      "Rapport : comment leur proportion varie (10e à 90e centile). Écart : différence de teinte, dans " +
      "l'image finale, entre les zones où l'une domine et celles où l'autre domine.</p>" +
      "<p>Rapport qui varie mais écart sous 10° : la paire est <b>confondue</b> (bichromie).</p>",
   target: "<p><b>Couleur cible</b> (teinte en degrés : 0 rouge, 30 orange, 50 or, 60 jaune, 120 vert, " +
      "180 cyan, 240 bleu, 300 magenta). Les zones où cette raie est plus forte sont tirées vers cette " +
      "teinte. La pastille montre la couleur.</p><p>Laisser la cible sur la couleur actuelle = rien ne change.</p>",
   force: "<p><b>Force</b> : jusqu'où les zones de cette raie vont vers la cible. 0 = raie inactive (la cible " +
      "n'a aucun effet), 1 = en partie, 2 à 3 = presque jusqu'à la cible. C'est l'équivalent du k, raie par raie.</p>" +
      "<p>Toucher la cible ou la tolérance d'une raie inactive met sa force à 1 automatiquement.</p>",
   tol: "<p><b>Tolérance</b> (degrés) : quelles couleurs actuelles ont le droit de bouger. Seuls les pixels " +
      "dont la teinte est à moins de cette valeur de la couleur actuelle de la raie sont touchés, avec un " +
      "effet qui diminue en s'éloignant.</p><p>C'est ce qui protège les zones d'une autre couleur (la Bulle " +
      "bleue ne bouge pas quand on règle le SII et le Ha).</p>",
   sat: "<p><b>Saturation</b> de la couleur dans les zones de cette raie : 1 = inchangée, 1,3 = 30 % plus " +
      "franche, 0,8 = plus douce. La luminosité ne change pas. Si une couleur sort des couleurs " +
      "affichables, le garde-fou la limite.</p>",
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
   oneB: "<p>Aperçu à 100 % de l'image de travail (réduite, environ 1 800 pixels de large).</p>",
   newInstance: "<p><b>Nouvelle instance.</b> Glisser ce triangle sur le bureau crée une icône avec tous les " +
      "réglages et le nom des quatre images. Double-clic : rouvre ce dialogue avec ces réglages. Glisser " +
      "l'icône sur l'image finale : applique directement.</p>",
   reset: "<p>Revenir aux réglages par défaut. L'analyse suivante refera la proposition.</p>",
   apply: "<p>Applique en pleine résolution et crée &lt;image finale&gt;_mix. La console donne les réglages, " +
      "le nombre de pixels modifiés, l'écart de luminance maximal et le nombre de nouveaux pixels écrêtés.</p>",
   close: "<p>Fermer. Les derniers réglages sont mémorisés.</p>"
};

var MixDialog = class extends Dialog {
constructor()
{
   super();
   var self = this;
   this.windowTitle = TITLE + " " + VERSION;
   var labelWidth = this.font.width( "Lissage des raies (px) :" ) + 10;
   var autoWidth = this.font.width( "Auto" ) + 32;

   // --- utilitaires de construction -------------------------------------
   this.numeric = {};
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
         if ( onChange ) onChange( key );
      };
      self.numeric[key] = nc;
      return nc;
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
            console.writeln( LINES[i] + " : force passée de 0 à 1 pour que la cible agisse." );
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
   this.rowS = this.makeViewRow( "SII linéaire :", "sId", TIPS.s );
   this.rowH = this.makeViewRow( "Ha linéaire :", "hId", TIPS.h );
   this.rowO = this.makeViewRow( "OIII linéaire :", "oId", TIPS.o );
   this.rowT = this.makeViewRow( "Image finale :", "tId", TIPS.t );

   this.paletteLabel = new Label( this );
   this.paletteLabel.text = "Palette :";
   this.paletteLabel.minWidth = labelWidth;
   this.paletteLabel.maxWidth = labelWidth;
   this.paletteLabel.textAlignment = TextAlignment.Right | TextAlignment.VertCenter;
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
   this.viewsGroup.title = "Images";
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
   this.analyseButton.text = "Analyser";
   this.analyseButton.toolTip = TIPS.analyse;
   this.analyseButton.onClick = function() { self.runAnalysis(); };

   this.proposeButton = new PushButton( this );
   this.proposeButton.text = "Proposition";
   this.proposeButton.toolTip = TIPS.propose;
   this.proposeButton.onClick = function()
   {
      if ( !self.ensureAnalysis() ) return;
      propose( TP, ANA );
      self.refreshFromTP();
      self.refreshPreview();
   };

   this.mapButton = new PushButton( this );
   this.mapButton.text = "Carte des raies";
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
         reportError( "carte", e );
         self.statusLabel.text = "<b>Erreur carte :</b> " + errText( e );
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
   this.diagLabel.text = "<p><i>Pas encore d'analyse.</i></p>";

   this.analyseGroup = new GroupBox( this );
   this.analyseGroup.title = "Passe 1 : analyse des raies";
   this.analyseGroup.sizer = new VerticalSizer;
   this.analyseGroup.sizer.margin = 6;
   this.analyseGroup.sizer.spacing = 6;
   this.analyseGroup.sizer.add( aRow );
   this.analyseGroup.sizer.add( this.diagLabel );

   // --- Avancé ----------------------------------------------------------------
   this.advCheck = this.makeCheck( "Réglages avancés", "showAdvanced", TIPS.advanced, function()
   {
      if ( TP.showAdvanced ) self.advGroup.show(); else self.advGroup.hide();
      self.adjustToContents();
   } );
   this.advGroup = new GroupBox( this );
   this.advGroup.title = "Réglages avancés de l'analyse";
   this.advGroup.sizer = new VerticalSizer;
   this.advGroup.sizer.margin = 6;
   this.advGroup.sizer.spacing = 4;
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Lissage des raies (px) :", "blurLines", 0, 60, 1, TIPS.blurLines, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Lissage des cartes (px) :", "blurMap", 0, 40, 1, TIPS.blurMap, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Lissage couleur (px) :", "blurColor", 0, 20, 1, TIPS.blurColor, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Seuil de signal :", "sigPct", 5, 95, 0, TIPS.sigPct, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Écart proposé (°) :", "split", 0, 90, 0, TIPS.split ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Fond SII :", "bgS", 0, 1, 6, TIPS.bg, stale ), "autoBg" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Fond Ha :", "bgH", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Fond OIII :", "bgO", 0, 1, 6, TIPS.bg, stale ) ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Poids SII :", "kS", 0.01, 100, 3, TIPS.weights, stale ), "autoWeights" ) );
   this.advGroup.sizer.add( this.row( this.makeNumeric( "Poids OIII :", "kO", 0.01, 100, 3, TIPS.weights, stale ) ) );

   // --- Colonne de gauche --------------------------------------------------------
   this.helpLabel = new Label( this );
   this.helpLabel.useRichText = true;
   this.helpLabel.wordWrapping = true;
   this.helpLabel.text = "<p><b>" + TITLE + " " + VERSION + "</b> : donne à chaque raie sa couleur. " +
      "Seule la teinte change, la luminosité reste celle de ton image.</p>" +
      "<p><i>1. Choisir les quatre images, 2. cliquer sur Analyser (10 à 30 s), 3. régler les couleurs " +
      "avec l'aperçu, 4. Appliquer. " +
      "Passer la souris sur un réglage pour son explication.</i></p>";

   this.leftColumn = new Control( this );
   this.leftColumn.sizer = new VerticalSizer;
   this.leftColumn.sizer.spacing = 6;
   this.leftColumn.sizer.add( this.helpLabel );
   this.leftColumn.sizer.add( this.viewsGroup );
   this.leftColumn.sizer.add( this.analyseGroup );
   this.leftColumn.sizer.add( this.advCheck );
   this.leftColumn.sizer.add( this.advGroup );
   this.leftColumn.sizer.addStretch();
   this.leftColumn.setMinWidth( this.logicalPixelsToPhysical( 430 ) );

   // --- Raies (passe 2) ------------------------------------------------------------
   this.swatch = [];
   this.famLabel = [];
   this.lineGroups = [];
   var lw2 = this.font.width( "Tolérance (°) :" ) + 10;
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
      fl.text = "couleur actuelle : ?";
      fl.textAlignment = TextAlignment.Left | TextAlignment.VertCenter;
      this.famLabel.push( fl );
      var top = new HorizontalSizer;
      top.spacing = 6;
      top.add( sw );
      top.add( fl, 100 );
      grp.sizer.add( top );
      grp.sizer.add( this.makeNumeric( "Cible (°) :", T_KEYS[i], 0, 360, 0, TIPS.target, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( "Force :", F_KEYS[i], 0, 3, 2, TIPS.force, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( "Tolérance (°) :", W_KEYS[i], 5, 120, 0, TIPS.tol, live, lw2 ) );
      grp.sizer.add( this.makeNumeric( "Saturation :", SAT_KEYS[i], 0.5, 2, 2, TIPS.sat, live, lw2 ) );
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
   this.fitButton.text = "Ajuster";
   this.fitButton.toolTip = TIPS.fitB;
   this.fitButton.onClick = function() { self.previewBox.zoomFit(); };
   this.oneButton = new PushButton( this );
   this.oneButton.text = "100 %";
   this.oneButton.toolTip = TIPS.oneB;
   this.oneButton.onClick = function() { self.previewBox.zoomOne(); };
   this.refreshButton = new PushButton( this );
   this.refreshButton.text = "Rafraîchir";
   this.refreshButton.toolTip = TIPS.refresh;
   this.refreshButton.onClick = function()
   {
      if ( self.ensureAnalysis() )
         self.refreshPreview();
   };
   this.beforeCheck = new CheckBox( this );
   this.beforeCheck.text = "Avant";
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

   this.resetButton = new ToolButton( this );
   this.resetButton.icon = this.scaledResource( ":/process-interface/reset.png" );
   this.resetButton.setScaledFixedSize( 20, 20 );
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
   this.applyButton.text = "Appliquer";
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
         reportError( "application", e );
         self.statusLabel.text = "<b>Erreur :</b> " + errText( e );
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
      }
      self.applyButton.enabled = true;
   };

   this.closeButton = new PushButton( this );
   this.closeButton.text = "Fermer";
   this.closeButton.icon = this.scaledResource( ":/icons/cancel.png" );
   this.closeButton.toolTip = TIPS.close;
   this.closeButton.onClick = function()
   {
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
         self.statusLabel.text = "<i>Pas encore d'analyse : clique sur Analyser</i>";
         return;
      }
      if ( ANA.key != analysisKey( TP ) )
      {
         self.statusLabel.text = "<i>Analyse à refaire : clique sur Rafraîchir</i>";
         return;
      }
      self.timer.stop();
      self.timer.start();
   };

   this.markStale = function()
   {
      if ( ANA != null && ANA.key != analysisKey( TP ) )
         self.statusLabel.text = "<i>Analyse à refaire : clique sur Rafraîchir</i>";
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
      var t = "<table cellspacing='4'><tr><th align='left'>Paire</th><th>Partage</th><th>Rapport</th>" +
              "<th>Écart</th><th align='left'>Verdict</th></tr>";
      for ( var q = 0; q < 3; ++q )
      {
         var D = ANA.diag[q];
         var name = LINES[D.a] + "/" + LINES[D.b];
         if ( D.p10 === undefined )
            t += "<tr><td>" + name + "</td><td colspan='4'>" + D.verdict + "</td></tr>";
         else
            t += "<tr><td>" + name + "</td><td align='right'>" + format( "%.0f %%", D.overlap ) +
                 "</td><td align='right'>" + format( "%+.2f / %+.2f", D.p10, D.p90 ) +
                 "</td><td align='right'>" + format( "%.0f°", Math.abs( D.sep ) ) + "</td><td>" +
                 ( D.confused ? "<b>" + D.verdict + "</b>" : D.verdict ) + "</td></tr>";
      }
      t += "</table>";
      self.diagLabel.text = t;
      for ( var i = 0; i < 3; ++i )
         self.famLabel[i].text = format( "couleur actuelle : %.0f°", ANA.fam[i] );
   };

   this.refreshFromTP = function()
   {
      for ( var key in self.numeric )
         self.numeric[key].setValue( TP[key] );
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
      self.statusLabel.text = "<b>Analyse en cours...</b> (10 à 30 s, voir la console)";
      CoreApplication.processEvents();
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
         reportError( "analyse", e );
         self.statusLabel.text = "<b>Erreur d'analyse :</b> " + errText( e );
         ( new MessageBox( "<p>" + errText( e ) + "</p>", TITLE, StdIcon.Error, StdButton.Ok ) ).execute();
      }
      self.analyseButton.enabled = true;
      self.updateEnabled();
      if ( ok )
      {
         self.statusLabel.text = format( "Analyse faite en %.1f s", ( Date.now() - t0 ) / 1000 );
         self.refreshPreview();
      }
   };

   this.beforeBitmap = null;
   this.refreshPreview = function()
   {
      if ( ANA == null )
      {
         self.statusLabel.text = "<i>Pas encore d'analyse : clique sur Analyser</i>";
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
               self.famLabel[i].text = format( "actuelle %.0f° | ", ANA.fam[i] ) +
                  ( ( TP[F_KEYS[i]] <= 0 && TP[SAT_KEYS[i]] == 1 ) ? "inactive (force 0)" :
                    format( "agit sur %.1f %% de l'image", 100 * st[i] / npx ) );
         }
         self.previewBox.setBitmap( bmp );
         var now = new Date();
         self.statusLabel.text = format( "Aperçu à jour (%02d:%02d:%02d, %.2f s)", now.getHours(), now.getMinutes(),
                                         now.getSeconds(), ( Date.now() - t0 ) / 1000 );
      }
      catch ( e )
      {
         reportError( "aperçu", e );
         self.statusLabel.text = "<b>Erreur d'aperçu :</b> " + errText( e );
      }
   };

   if ( !TP.showAdvanced )
      this.advGroup.hide();
   this.refreshFromTP();
   this.adjustToContents();
   this.setMinWidth( this.logicalPixelsToPhysical( 1200 ) );
   this.setMinHeight( this.logicalPixelsToPhysical( 760 ) );
}
};

// ============================================================================
// Point d'entrée
// ============================================================================

function main()
{
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
         reportError( "icône", e );
      }
      return;
   }
   if ( Parameters.isGlobalTarget )
      loadParameters();
   else
      loadSettings();
   var dialog = new MixDialog;
   dialog.execute();
   ANA = null;
}

main();
