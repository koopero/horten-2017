'use strict'

const NS = require('./namespace')

const now = () => { new Date().getTime() }

const _listenNames = ['delta']
    , _listenKeys = {}



_listenNames.forEach( function ( name ) { _listenKeys[name] = Symbol( name ) } )

const EventEmitter = require('events')
    , assert = require('assert')

const split = require('./path').split
    , slice = require('./path').slice
    , wrap = require('./wrap')
    , eachKey = require('./eachKey')
    , Mutant = require('./Mutant')
    , Echo = require('./Echo')
    , isEmpty = require('./isEmpty')
    , hasKeys = require('./hasKeys')

class Cursor extends EventEmitter {
  constructor ( config ) {
    super()
    const self = this

    this[ NS.held ] = {}


    self[ NS.delta ] = new Mutant()
    self[ NS.echo ] = new Echo()
    self[ NS.hold ] = false
    self[ NS.immediate ] = null
    self[ NS.timeout ] = null

    self[ NS.listenerBound ] = {}
    eachKey( self[NS.listener], function ( listener, name ) {
      self[ NS.listenerBound ][name] = listener.bind( self )
    } )

    self.delay = 0

    if ( hasKeys( config ) )
      self.configure( config )
  }

  configure( config ) {
    if ( !hasKeys( config ) )
      throw new Error('Invalid arguments')

    const self = this
        , keys = [
      'delay',
      'listening',
      'hold',
      'root',
      'path',
      'mutant'
    ]

    keys.forEach( ( key ) => {
      if ( 'undefined' !== typeof config[key] )
        self[key] = config[key]
    } )
  }

  set listening ( value ) {
    const self = this
    value = !!value

    const current = self[ NS.listening ]
        , mutant = self[ NS.mutant ]

    if ( mutant && value && !current ) {
      eachKey( self[ NS.listenerBound ], function ( listener, name ) {
        mutant.on( name, listener )
      })
    }

    if ( mutant && !value && current ) {
      eachKey( self[ NS.listenerBound ], function ( listener, name ) {
        mutant.removeEventListener( name, listener )
      })
    }

    self[ NS.listening ] = value
  }

  get listening () {
    return this[ NS.listening ]
  }

  set mutant( newMutant ) {
    var mutant = this[ NS.mutant ]

    if ( !Mutant.isMutant( newMutant ) ) {
      throw new Error("Mutant imposter!")
      newMutant = null
    }

    if ( newMutant != mutant ) {
      var wasListening = this.listening
      this.listening = false
      this[ NS.mutant ] = newMutant
      this.listening = wasListening
    }

  }

  get mutant() {
    if ( !this[ NS.mutant ] ) {
      this.mutant = this.root
    }
    return this[ NS.mutant ]
  }

  set path( value ) {
    value = split( value )
    this.mutant = this.root.walk( value )
    this[ NS.path ] = value
  }

  get path() {
    return this[ NS.path ] || []
  }

  set root( value ) {
    this[ NS.root ] = value
    if ( !this[ NS.mutant ] )
      this.path = this.path
  }

  get root() {
    if ( !this[ NS.root ] ) {
      this[ NS.root ] = require('./root')
    }
    return this[ NS.root ]
  }

  set value( value ) {
    if ( this[ NS.echo ] )
      this[ NS.echo ].send( value )

    this.mutant.set( value )
  }

  get value() {
    return this.mutant.get()
  }

  set delay( value ) {
    this[ NS.delayTime ] = Math.max( -1, parseInt( value ) || 0 )
  }

  get delay() {
    return this[ NS.delayTime ]
  }

  set hold( value ) {
    value = !!value
    const oldValue = this[ NS.hold ]
    this[ NS.hold ] = value

    if ( !value && oldValue ) {
      this[ NS.clearTimers ]()
    } else if ( oldValue && !value ) {
      this.trigger()
    }
  }

  get hold() {
    return this[ NS.hold ]
  }

  trigger( forceDelay ) {
    const self = this
        , delay = self[ NS.delayTime ]

    if ( self[ NS.hold ] )
      return false

    self[ NS.clearTimers ]()
    const release = self.release.bind( self )

    if ( delayIsTimeout( delay ) ) {
      self[ NS.timeout ] = setTimeout( release, delay )
    } else if ( delayIsImmediate( delay ) && forceDelay ) {
      self[ NS.immediate ] = setImmediate( release )
    } else {
      release()
    }
  }

  release() {
    const self = this
        , held = self[ NS.held ]

    if ( self[ NS.releasing ] )
      console.warn('Reentrant release.')

    var delta = this[ NS.delta ].get()

    self[ NS.delta ].del()
    self[ NS.held ] = {}
    self[ NS.clearTimers ]()
    self[ NS.releaseTime ] = now()
    self[ NS.releasing ] = true


    if ( held.change )
      this.emit( 'change' )

    if ( held.value )
      this.emit( 'value', this.value )

    if ( self[ NS.echo ] ) {
      delta = self[ NS.echo ].receive( delta )
    }

    if ( delta !== undefined && !( hasKeys( delta ) && isEmpty( delta ) ) )
      this.emit( 'delta', delta )

    self[ NS.releasing ] = false
  }

  //
  //
  //
  patch( value ) {
    const path = slice( arguments, 1 )
        , mutant = this.mutant

    if ( this[ NS.echo ] )
      this[ NS.echo ].send( wrap( value, path ) )

    return mutant.patch.apply( mutant, arguments )
  }

  get( path ) {
    const mutant = this.mutant
    return mutant.get.apply( mutant, arguments )
  }

}

Cursor.prototype[ NS.clearTimers ] = function() {
  if ( this[ NS.immediate ] ) {
    clearImmediate( this[ NS.immediate ] )
    this[ NS.immediate ] = null
  }

  if ( this[ NS.timeout ] ) {
    clearTimeout( this[ NS.timeout ] )
    this[ NS.timeout ] = null
  }
}


//
// Listeners upon Mutant
//

Cursor.prototype[ NS.listener ] = {}

Cursor.prototype[ NS.listener ].delta = function ( delta ) {
  this[ NS.delta ].patch( delta )
  this[ NS.held ].change = true
  this[ NS.held ].value  = true
  this.trigger()
}

module.exports = Cursor


//
// Utility Functions
//

function delayIsImmediate( delay ) {
  return delay > 0 && delay < 10
}

function delayIsTimeout( delay ) {
  return delay >= 10
}
