import unexpected from 'unexpected';
import unexpectedReact from 'unexpected-react';
import unexpectedSinon from 'unexpected-sinon';
import unexpectedDOM from 'unexpected-dom';
import sinon from 'sinon';
import { jsdom } from 'jsdom';
import requestAnimationFrame, { cancel as cancelAnimationFrame } from 'raf';
import Canvas from 'canvas';
import React, { Component } from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { renderToString } from 'react-dom/server';
import { createRenderer, renderIntoDocument } from 'react-addons-test-utils';
import { stripIndent } from 'common-tags';

import Truncate from '../src/Truncate';

const expect = unexpected.clone()
    .use(unexpectedReact)
    .use(unexpectedSinon)
    .addAssertion('<spyCall> to have arguments <any*>', (expect, subject, ...args) => {
        return expect(subject, 'to satisfy', { args });
    })
    .use(unexpectedDOM)
    .addAssertion('<DOMElement> to display text <string>', (expect, subject, value) => {
        function nodeToText(node) {
            return Array.prototype.reduce.call(node.children, (prev, curr) => {
                if (curr instanceof global.window.HTMLBRElement) {
                    return prev += '\n';
                }

                return prev += curr.textContent;
            }, '');
        }

        return expect(nodeToText(subject), 'to equal', stripIndent`${value}`);
    })
;

describe('<Truncate />', () => {
    it('should be a React component', () => {
        expect(Truncate, 'to be a', Component.constructor);
    });

    it('should render a span', () => {
        const renderer = createRenderer();
        renderer.render(<Truncate />);

        expect(renderer, 'to have rendered', <span />);
    });

    describe('in a server environment', () => {
        it('should render initial static markup', async () => {
            const markup = renderToString(
                <Truncate
                    lines={2}
                    ellipsis='…'
                    onTruncate={() => {}}
                >
                    Some text inside of here
                </Truncate>
            );

            const captures = await expect(
                markup, 'to match', /Some text inside of here/g
            );

            expect(captures.length, 'to be', 1);
        });
    });

    describe('in a client environment', () => {
        before(() => {
            global.document = jsdom();
            global.window = global.document.defaultView;
            global.window.Canvas = Canvas;
            global.window.requestAnimationFrame = requestAnimationFrame;
            global.window.cancelAnimationFrame = cancelAnimationFrame;
            Object.defineProperty(global.window.HTMLElement.prototype, 'innerText', {
                configurable: true,
                get() {
                    let text = '';

                    for (const node of this.childNodes) {
                        if (node instanceof global.window.HTMLBRElement) {
                            text += '\n';
                            continue;
                        }

                        if (node instanceof global.window.Comment) {
                            continue;
                        }

                        const {
                            nodeValue
                        } = node;

                        if (nodeValue !== undefined) {
                            text += nodeValue;
                        }
                    }

                    return text;
                }
            });

            for (const key in global.window) {
                if (!global[key]) {
                    global[key] = global.window[key];
                }
            }
        });

        describe('with a box of 85px mocked out', () => {
            const renderIntoBox = component => renderIntoDocument(
                <div>
                    {component}
                </div>
            ).children[0];

            before(() => {
                sinon.stub(global.window.HTMLDivElement.prototype,
                    'getBoundingClientRect', () => ({ width: 85 })
                );

                // Approximate .offsetWidth with context.measureText
                sinon.stub(Truncate.prototype,
                    'ellipsisWidth', node => {
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        context.font = 'normal normal 12px Times New Roman';

                        return context.measureText(node.textContent).width;
                    }
                );
            });

            after(() => {
                global.window.HTMLDivElement.prototype.getBoundingClientRect.restore();

                Truncate.prototype.ellipsisWidth.restore();
            });

            it('should truncate text', () => {
                const component = renderIntoBox(
                    <Truncate lines={2} ellipsis='…'>
                        This text should
                        stop after here
                        and not contain the
                        next lines
                    </Truncate>
                );

                expect(component, 'to display text', `
                    This text should
                    stop after here…
                `);
            });

            it('should preserve newlines', () => {
                const component = renderIntoBox(
                    <Truncate lines={4}>
                        This text
                        contains<br />
                        <br />
                        newlines
                    </Truncate>
                );

                expect(component, 'to display text', `
                    This text
                    contains

                    newlines
                `);
            });

            it("should not add empty lines when text doesn't fill all lines", () => {
                const component = renderIntoBox(
                    <Truncate lines={4}>
                        Some short text
                        over here
                    </Truncate>
                );

                expect(component, 'to display text', `
                    Some short text
                    over here
                `);
            });

            it('should not truncate at all if specified in lines prop', () => {
                const Content = props => (
                    <span>
                        Preserve this text
                        as it was!
                    </span>
                );

                const Wrapper = class extends Component {
                    render() {
                        return (
                            <Truncate lines={false}>
                                <Content />
                            </Truncate>
                        );
                    }
                };

                const component = renderIntoDocument(<Wrapper />);

                expect(component, 'to contain', (
                    <span>
                        <Content />
                        <span ref='text'><Content /></span>
                    </span>
                ));
            });

            it('should end truncating when a single word is bigger than its line', () => {
                const component = renderIntoBox(
                    <Truncate lines={2} ellipsis='…'>
                        Thereisasuperlongwordinthefirstline
                        so that the next lines won't be
                        visible
                    </Truncate>
                );

                expect(component, 'to display text', `
                    Thereisasuperl…
                `);
            });

            it('should be able to use a react component as ellipsis', () => {
                const component = renderIntoBox(
                    <Truncate lines={2} ellipsis={<a href='#'>… read more</a>}>
                        I'm curious what
                        the next lines of
                        text will say!
                    </Truncate>
                );

                expect(component, 'to display text', `
                    I'm curious what
                    the … read more
                `);
            });

            it('should update content when new children are passed in', () => {
                const container = document.createElement('div');

                const component = render(
                    <div>
                        <Truncate lines={1}>
                            Some old content
                        </Truncate>
                    </div>,
                    container
                );

                expect(component, 'to display text', `
                    Some old cont…
                `);

                render(
                    <div>
                        <Truncate lines={1}>
                            Some new content
                        </Truncate>
                    </div>,
                    container
                );

                expect(component, 'to display text', `
                    Some new con…
                `);
            });

            describe('onTruncate', () => {
                describe('with Truncate.prototype.onTruncate mocked out', () => {
                    before(() => {
                        // Stub the onTruncate function in a synchronous manner
                        sinon.stub(Truncate.prototype, 'onTruncate', function (didTruncate) {
                            const {
                                onTruncate
                            } = this.props;

                            if (typeof onTruncate === 'function') {
                                onTruncate(didTruncate);
                            }
                        });
                    });

                    after(() => {
                        Truncate.prototype.onTruncate.restore();
                    });

                    it('should call with true when text was truncated', () => {
                        const handleTruncate = sinon.spy();

                        renderIntoBox(
                            <Truncate onTruncate={handleTruncate}>
                                This is some text
                                that got truncated
                            </Truncate>
                        );

                        expect(handleTruncate.lastCall, 'to have arguments', true);
                    });

                    describe('should call with false when text was not truncated because', () => {
                        it('was disabled with lines prop', () => {
                            const handleTruncate = sinon.spy();

                            renderIntoBox(
                                <Truncate lines={false} onTruncate={handleTruncate}>
                                    This is some text
                                    that did not get
                                    truncated
                                </Truncate>
                            );

                            expect(handleTruncate.lastCall, 'to have arguments', false);
                        });

                        it('has shorter text than lines allow', () => {
                            const handleTruncate = sinon.spy();

                            renderIntoBox(
                                <Truncate lines={3} onTruncate={handleTruncate}>
                                    This is some text
                                    that did not get
                                    truncated
                                </Truncate>
                            );

                            expect(handleTruncate.lastCall, 'to have arguments', false);
                        });
                    });
                });

                it('should invoke asynchronously', async () => {
                    const nextFrame = () => new Promise(resolve =>
                        requestAnimationFrame(resolve)
                    );

                    const handleTruncate = sinon.spy();

                    renderIntoBox(
                        <Truncate onTruncate={handleTruncate} />
                    );

                    expect(handleTruncate, 'was not called');

                    await nextFrame();

                    expect(handleTruncate, 'was called');
                });
            });
        });

        it('should render without an error when the last line is exactly as wide as the container', () => {
            const text = 'Foo bar - end of text';

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const measureText = context.measureText.bind(context);

            sinon.stub(global.window.HTMLDivElement.prototype,
                'getBoundingClientRect', () => ({
                    width: measureText(text).width
                })
            );

            // Approximate .offsetWidth with context.measureText
            sinon.stub(Truncate.prototype,
                'ellipsisWidth', node => {
                    return measureText(node.textContent).width;
                }
            );

            try {
                const render = () => renderIntoDocument(
                    <div>
                        <Truncate lines={2}>
                            Foo bar - end of text
                        </Truncate>
                    </div>
                );

                expect(render, 'not to throw');
            } finally {
                global.window.HTMLDivElement.prototype.getBoundingClientRect.restore();

                Truncate.prototype.ellipsisWidth.restore();
            }
        });

        it('should recalculate when resizing the window', () => {
            const calcTargetWidth = sinon.spy(Truncate.prototype, 'calcTargetWidth');

            try {
                renderIntoDocument(<Truncate />);

                const numCalled = calcTargetWidth.callCount;

                window.dispatchEvent(new window.Event('resize'));

                expect(calcTargetWidth, 'was called times', numCalled + 1);
            } finally {
                Truncate.prototype.calcTargetWidth.restore();
            }
        });

        it('should clean up all event listeners on window when unmounting', () => {
            const events = new Set();

            sinon.stub(window, 'addEventListener', (name, handler) => {
                events.add({
                    name,
                    handler
                });
            });

            sinon.stub(window, 'removeEventListener', (name, handler) => {
                for (const event of events) {
                    if (event.name === name && event.handler === handler) {
                        events.delete(event);
                    }
                }
            });

            try {
                const container = document.createElement('div');

                render(<Truncate />, container);

                unmountComponentAtNode(container);

                expect(events.size, 'to be', 0);
            } finally {
                window.addEventListener.restore();
                window.removeEventListener.restore();
            }
        });

        describe('innerText', () => {
            describe('browser implements \\n for <br/>', () => {
                it('should have newlines only at <br/>', () => {
                    const node = document.createElement('div');
                    node.innerHTML = 'foo<br/>bar\nbaz';

                    expect(Truncate.prototype.innerText(node), 'to be', 'foo\nbar baz');
                });
            });

            describe('browser implements "" for <br/>', () => {
                before(() => {
                    Object.defineProperty(global.window.HTMLElement.prototype, 'innerText', {
                        configurable: true,
                        get() {
                            let text = '';

                            for (const node of this.childNodes) {
                                if (node instanceof global.window.HTMLBRElement) {
                                    text += '';
                                    continue;
                                }

                                if (node instanceof global.window.Comment) {
                                    continue;
                                }

                                const {
                                    nodeValue
                                } = node;

                                if (nodeValue !== undefined) {
                                    text += nodeValue;
                                }
                            }

                            return text;
                        }
                    });
                });

                it('should have newlines only at <br/>', () => {
                    const node = document.createElement('div');
                    node.innerHTML = 'foo<br/>bar\nbaz';

                    expect(Truncate.prototype.innerText(node), 'to be', 'foo\nbar baz');
                });
            });
        });
    });

    describe('ellipsisWidth', () => {
        it('should equal node.offsetWidth', () => {
            const offsetWidth = () => 123;

            const node = {};

            Object.defineProperty(node, 'offsetWidth', {
                get: offsetWidth
            });

            expect(Truncate.prototype.ellipsisWidth(node), 'to be', 123);
        });
    });
});
