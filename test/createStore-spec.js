/* globals describe it */
import { expect } from 'chai';
import { createStore } from '../';
import { Observable } from 'rxjs';

const FOO = '@test/FOO';
const BAR = '@test/BAR';

const noopModule = {
  flow: dispatch$ => [dispatch$],
  reducer: (state, action) => state,
};

function fooFlow(dispatch$) {
  return [
    dispatch$.filterAction(FOO)
  ];
}

function barFlow(dispatch$) {
  return [
    dispatch$.filterAction(BAR)
  ];
}

describe('createStore', () => {
  it('exposes the public API', () => {
    const store = createStore({ noopModule });

    expect(Object.keys(store)).to.have.length(6);
    expect(store.getState$).to.be.a('function');
    expect(store.getState).to.be.a('function');
    expect(store.dispatch).to.be.a('function');
    expect(store.setMiddleware).to.be.a('function');
    expect(store.hydrate).to.be.a('function');
    expect(store.clearState).to.be.a('function');
  });

  it('gets initial state from reducer', () => {
    const initialState = { valueA: 10 };
    const fooModule = {
      flow: dispatch$ => [dispatch$],
      reducer: (state = initialState, action) => state
    };

    const store = createStore({ fooModule });

    let fooState;
    const sub = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    expect(fooState).to.deep.eq({ valueA: 10 });
    sub.unsubscribe();
  });

  describe('dispatch', () => {
    it('reaches all active streams', () => {
      const fooModule = {
        flow: fooFlow,
        reducer(state = [], { type }) {
          switch (type) {
            case FOO:
              return state.concat(type);
            default:
              return state;
          }
        },
      };
      const barModule = {
        flow: barFlow,
        reducer(state = [], { type }) {
          switch (type) {
            case BAR:
              return state.concat(type);
            default:
              return state;
          }
        },
      };

      const store = createStore({
        fooModule,
        barModule,
      });

      let fooState;
      const subOne = store.getState$('fooModule').subscribe(state => {
        fooState = state;
      });

      let barState;
      const subTwo = store.getState$('barModule').subscribe(state => {
        barState = state;
      });

      expect(fooState).to.deep.equal([]);
      expect(barState).to.deep.equal([]);

      store.dispatch({ type: FOO });

      expect(fooState).to.deep.equal([FOO]);
      expect(barState).to.deep.equal([]);

      store.dispatch({ type: BAR });

      expect(fooState).to.deep.equal([FOO]);
      expect(barState).to.deep.equal([BAR]);

      subOne.unsubscribe();
      subTwo.unsubscribe();
    });
  });

  it('allows state access when composing action streams', () => {
    const fooModule = {
      flow(dispatch$, { getState }) {
        const foo$ = dispatch$
          .filterAction(FOO)
          .mapPayload(foo => getState().barModule.bar * foo);

        return [foo$];
      },
      reducer(state = [], { type, payload }) {
        switch (type) {
          case FOO:
            return state.concat(payload);
          default:
            return state;
        }
      }
    };

    const barModule = {
      flow: barFlow,
      reducer(state = { bar: 2 }, action) {
        return state;
      }
    };

    const store = createStore({
      fooModule,
      barModule,
    });

    let fooState;
    const subOne = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    store.dispatch({ type: FOO, payload: 10 });
    expect(fooState).to.deep.eq([20]);

    store.dispatch({ type: FOO, payload: 21 });
    expect(fooState).to.deep.eq([20, 42]);

    subOne.unsubscribe();
  });

  it('preloads state', () => {
    const fooModule = {
      flow: fooFlow,
      reducer(state = { valueA: 11, valueB: 12 }, { type }) {
        switch (type) {
          case FOO:
            return {
              ...state,
              valueA: state.valueA * 2,
            };
          default:
            return state;
        }
      },
    };

    const preloadedState = {
      fooModule: { valueA: 13, valueB: 14 }
    };
    const store = createStore({ fooModule }, preloadedState);

    let fooState;
    const sub1 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    expect(fooState).to.deep.eq({ valueA: 13, valueB: 14 });

    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq({ valueA: 26, valueB: 14 });
    sub1.unsubscribe();
  });

  it('caches state between subscriptions', () => {
    const fooModule = {
      flow: fooFlow,
      reducer(state = [], { type }) {
        switch (type) {
          case FOO:
            return state.concat(type);
          default:
            return state;
        }
      },
    };

    const store = createStore({ fooModule });

    let fooState;
    const sub1 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    store.dispatch({ type: FOO });
    store.dispatch({ type: FOO });

    expect(fooState).to.deep.eq([FOO, FOO]);
    sub1.unsubscribe();

    const sub2 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });
    expect(fooState).to.deep.eq([FOO, FOO]);
    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq([FOO, FOO, FOO]);

    sub2.unsubscribe();
  });

  it('manages to scale', (done) => {
    function generateModule(count) {
      const SOME_FOO = `SOME_FOO_${count}`;
      const SOME_BAR = `SOME_BAR_${count}`;
      const PEAKY_EFFECT = `PEAKY_EFFECT_${count}`;

      const SHOOT = `SHOOT_${count}`;
      const SHOOT_POOL = `SHOOT_POOL_${count}`;
      const SHOOT_SOME_POOL = `SHOOT_SOME_POOL_${count}`;

      const initialState = {
        foo: [],
        bar: [],
        peakyEffect: [],
        shoot: []
      };
      return {
        flow(dispatch$) {
          const someFoo$ = dispatch$.filterAction(SOME_FOO);
          const someBar$ = dispatch$.filterAction(SOME_BAR);

          const peakyEffect$ = Observable
            .merge(
              someFoo$
                .pluckPayload()
                .filter(foo => foo > 42)
                .mapTo('Tommy'),
              someBar$
                .pluckPayload()
                .filter(bar => bar < 42)
                .mapTo('Arthur')
            )
            .mapAction(PEAKY_EFFECT);

          return [
            someFoo$,
            someBar$,
            peakyEffect$,
            dispatch$.filterAction(SHOOT),
            dispatch$.filterAction(SHOOT_POOL),
            dispatch$.filterAction(SHOOT_SOME_POOL),
          ];
        },
        reducer(state = initialState, action) {
          switch (action.type) {
            case SOME_FOO:
              return {
                ...state,
                foo: state.foo.concat(action.payload),
              };
            case SOME_BAR:
              return {
                ...state,
                bar: state.bar.concat(action.payload),
              };
            case PEAKY_EFFECT:
              return {
                ...state,
                peakyEffect: state.peakyEffect.concat(action.payload),
              };
            case SHOOT:
              return {
                ...state,
                shoot: state.shoot.concat(action.payload),
              };
            default:
              return state;
          }
        }
      };
    }

    const modules = {};
    for (let i = 0; i < 250; i++) {
      const moduleName = `module${i}`;
      modules[moduleName] = generateModule(i);
    }

    console.time('creatStore');
    const store = createStore(modules);
    console.timeEnd('creatStore');

    let sub1 = store.getState$('module10').subscribe(state => {});
    let sub2 = store.getState$('module20').subscribe(state => {});
    let sub3 = store.getState$('module30').subscribe(state => {});
    let sub4 = store.getState$('module40').subscribe(state => {});
    let sub5 = store.getState$('module50').subscribe(state => {});
    let sub6 = store.getState$('module60').subscribe(state => {});
    let sub7 = store.getState$('module70').subscribe(state => {});
    let sub8 = store.getState$('module80').subscribe(state => {});
    let sub9 = store.getState$('module90').subscribe(state => {});
    let sub10 = store.getState$('module100').subscribe(state => {});

    console.time('dispatch-FOO');
    store.dispatch({ type: 'SOME_FOO_20', payload: 40 });
    console.timeEnd('dispatch-FOO');

    expect(store.getState().module20).to.deep.eq({
      foo: [40],
      bar: [],
      peakyEffect: [],
      shoot: [],
    });

    console.time('dispatch-BAR');
    store.dispatch({ type: 'SOME_BAR_60', payload: 40 });
    console.timeEnd('dispatch-BAR');

    expect(store.getState().module60).to.deep.eq({
      foo: [],
      bar: [40],
      peakyEffect: [],
      shoot: [],
    });

    console.time('dispatch-BAR');
    store.dispatch({ type: 'SOME_BAR_70', payload: 10 });
    console.timeEnd('dispatch-BAR');

    console.time('dispatch-BAR');
    store.dispatch({ type: 'SOME_BAR_80', payload: 10 });
    console.timeEnd('dispatch-BAR');

    console.time('dispatch-BAR');
    store.dispatch({ type: 'SOME_BAR_90', payload: 10 });
    console.timeEnd('dispatch-BAR');

    console.time('dispatch-BAR');
    store.dispatch({ type: 'SOME_BAR_100', payload: 10 });
    console.timeEnd('dispatch-BAR');

    setTimeout(() => {
      const { module20, module60 } = store.getState();
      expect(module20).to.deep.eq({
        foo: [40],
        bar: [],
        peakyEffect: [],
        shoot: [],
      });

      expect(module60).to.deep.eq({
        foo: [],
        bar: [40],
        peakyEffect: ['Arthur'],
        shoot: [],
      });

      sub1.unsubscribe();
      sub2.unsubscribe();
      sub3.unsubscribe();
      sub4.unsubscribe();
      sub5.unsubscribe();
      sub6.unsubscribe();
      sub7.unsubscribe();
      sub8.unsubscribe();
      sub9.unsubscribe();
      sub10.unsubscribe();

      done();
    }, 20);
  });

  it('broadcasts state changes to multiple subscriptions', () => {
    const fooModule = {
      flow: fooFlow,
      reducer(state = [], { type }) {
        switch (type) {
          case FOO:
            return state.concat(type);
          default:
            return state;
        }
      },
    };

    const store = createStore({ fooModule });

    let fooState;
    const sub1 = store.getState$('fooModule').subscribe(state => {
      fooState = state;
    });

    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq([FOO]);

    let foo2State;
    const sub2 = store.getState$('fooModule').subscribe(state => {
      foo2State = state;
    });
    expect(foo2State).to.deep.eq([FOO]);

    store.dispatch({ type: FOO });
    expect(fooState).to.deep.eq([FOO, FOO]);
    expect(foo2State).to.deep.eq([FOO, FOO]);

    sub1.unsubscribe();
    store.dispatch({ type: FOO });

    expect(fooState).to.deep.eq([FOO, FOO]);
    expect(foo2State).to.deep.eq([FOO, FOO, FOO]);
    sub2.unsubscribe();
  });

  it('passes state changes to middleware', () => {
    const fooModule = {
      flow: fooFlow,
      reducer(state = [], { type }) {
        switch (type) {
          case FOO:
            return state.concat(type);
          default:
            return state;
        }
      },
    };
    const barModule = {
      flow: barFlow,
      reducer(state = [], { type }) {
        switch (type) {
          case BAR:
            return state.concat(type);
          default:
            return state;
        }
      },
    };

    let loggedModuleName;
    let loggedAction;
    let loggedOldState;
    let loggedNewState;
    const logger = (moduleName, action, oldState, newState) => {
      loggedModuleName = moduleName;
      loggedAction = action;
      loggedOldState = oldState;
      loggedNewState = newState;
    };

    const store = createStore({ fooModule, barModule });
    store.setMiddleware(logger);

    const sub1 = store.getState$('fooModule').subscribe(s => {});
    const sub2 = store.getState$('barModule').subscribe(s => {});

    store.dispatch({ type: FOO });
    expect(loggedModuleName).to.eq('fooModule');
    expect(loggedAction).to.deep.eq({ type: FOO });
    expect(loggedOldState).to.deep.eq([]);
    expect(loggedNewState).to.deep.eq([FOO]);

    store.dispatch({ type: BAR });
    expect(loggedModuleName).to.eq('barModule');
    expect(loggedAction).to.deep.eq({ type: BAR });
    expect(loggedOldState).to.deep.eq([]);
    expect(loggedNewState).to.deep.eq([BAR]);

    sub1.unsubscribe();
    sub2.unsubscribe();
  });
});
