import '@angular/compiler';
import { Component, InjectionToken, inject } from '@angular/core';
import { bindReadonly } from '../../../dist/core/Angular/index.js';

export const counterToken = new InjectionToken('request counter');

export function angularView(selector) {
  class Counter {
    selected = bindReadonly(inject(counterToken))(selector).state;
  }
  Component({
    selector: 'state-counter',
    standalone: true,
    template: '<output>{{ selected() }}</output>',
  })(Counter);
  return Counter;
}
