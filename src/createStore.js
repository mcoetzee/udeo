import { Observable, Subject } from './rx-ext';

const INIT = '@udeo/INIT';
const HYDRATE = '@udeo/HYDRATE';
const CLEAR_STATE = '@udeo/CLEAR_STATE';

/**
 * Creates a store which houses a collection of state streams. It adds a
 * state stream for each module provided. Each module provides a
 * definition which contains two functions: { flow, reducer }
 * The flow function should return an array of action streams to be reduced
 * by the provided reducer in order to form the module's state stream
 */
export function createStore(defs, preloadedState = {}) {
  // The raw action stream used when dispatching
  const dispatch$ = new Subject();
  const sideEffectStreams = {};
  const stateStreams = {};
  let currentState = preloadedState;

  /**
   * Adds a state stream for each module provided
   */
  function addStreams(definitions) {
    Object.keys(definitions).forEach(moduleName => {
      const moduleResources = definitions[moduleName];
      // Use preloaded state or use dummy action to get initial state from reducer
      if (!currentState[moduleName]) {
        currentState[moduleName] = moduleResources.reducer(undefined, { type: INIT });
      }

      // The API provided to each flow function in addition to the dispatch$
      const api = {
        getState,
        // Provides a way to get a single action stream by type
        getAction$: (actionType) => getSideEffect$(moduleName, actionType),
        dispatch,
      };

      // The dispatch$ is to be used to filter out actions that have been dispatched
      const streams = moduleResources.flow(dispatch$, api);

      stateStreams[moduleName] = createState$(
        moduleName,
        streams,
        moduleResources.reducer
      );
    });
  }

  function dispatch(action) {
    dispatch$.next(action);
  }

  function getState(moduleName) {
    return moduleName ? currentState[moduleName] : currentState;
  }


  const connectedStreams = {};
  /**
   * Gets the state stream and connects it if not yet connected
   */
  function getState$(moduleName) {
    let state$ = stateStreams[moduleName];
    if (!connectedStreams[moduleName]) {
      connectedStreams[moduleName] = state$;
      state$.connect();
    }
    return state$;
  }

  /**
   * Adds a side effect stream for the given action type. This side effect stream
   * will flow as the action stream for the given action type flows through.
   * The side effect stream will only flow if the action type in question is flowing
   * from its origin. Thus we need to keep track of which module requested the
   * side effect stream
   */
  function getSideEffect$(requestingModule, actionType) {
    let register = sideEffectStreams[actionType];
    if (!register) {
      register = {
        sideEffect$: new Subject(),
        modules: { [requestingModule]: true }
      };
      sideEffectStreams[actionType] = register;
    } else {
      register.modules[requestingModule] = true;
    }
    return register.sideEffect$;
  }

  const metaDispatch$ = new Subject();

  /**
   * Dispatch HYDRATE action which each state stream knows how to handle
   */
  function hydrate(moduleName, h) {
    metaDispatch$.next({
      type: HYDRATE,
      payload: h,
      meta: moduleName,
    });
  }

  /**
   * Dispatch CLEAR_STATE action which each state stream knows how to handle
   */
  function clearState(moduleName) {
    metaDispatch$.next({
      type: CLEAR_STATE,
      meta: moduleName,
    });
  }

  let actionMiddleware;
  let newStateMiddleware;
  actionMiddleware = newStateMiddleware = () => {};
  /**
   * Set middleware to be invoked for each action and each state change
   */
  function setMiddleware(...mw) {
    [actionMiddleware, newStateMiddleware] = mw;
  }

  /**
   * Uses the provided action streams and reducer to build a state stream.
   * The given action streams will be combined with more general action streams
   * of type: HYDRATE and CLEAR_STATE
   * These general action streams will be auto reduced for each module
   */
  function createState$(moduleName, streams, reducer) {
    // Combine module's action streams with common module actions streams
    const combinedAction$ = Observable.merge(
      ...streams,
      metaDispatch$.filter(action => action.meta === moduleName)
    );

    return combinedAction$
      // Side effects
      .do(action => {
        const register = sideEffectStreams[action.type];
        // Let action flow through registered side effect stream if the current module is the origin
        if (register && !register.modules[moduleName]) {
          register.sideEffect$.next(action);
        }
        actionMiddleware(moduleName, action);
      })
      .startWith(currentState[moduleName])
      // Reduce state
      .scan((state, action) => {
        switch (action.type) {
          case HYDRATE:
            return {
              ...state,
              ...action.payload,
              hydrated: true,
            };

          case CLEAR_STATE:
            return reducer(undefined, action);

          default:
            return reducer(state, action);
        }
      })
      // Record new state + side effects
      .do(newState => {
        currentState = {
          ...currentState,
          [moduleName]: newState,
        };
        newStateMiddleware(moduleName, newState);
      })
      // Provide latest from state stream on subscribe
      .publishReplay(1);
  }

  // Init
  addStreams(defs);

  // Store API
  return {
    dispatch,
    getState$,
    getState,
    hydrate,
    clearState,
    setMiddleware,
  };
}
