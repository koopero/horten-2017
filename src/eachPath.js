'use strict'

const split = require('./path').split
    , hasKeys = require('./hasKeys')
    , eachKey = require('./eachKey')

module.exports = function eachPath( subject, callback, initialPath ) {
  const result = []
  walk( subject, split( initialPath ) )
  return result

  function walk( subject, path ) {
    if ( hasKeys( subject ) ) {
      eachKey( subject, function ( value, key ) {
        walk( value, path.concat( key ) )
      } )
    } else if ( 'undefined' != typeof subject ) {
      if ( callback )
        callback( subject, path )

      result.push( path )
    }
  }
}
