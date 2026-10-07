// JSDoc's parser uses Closure types; TypeScript also accepts intersections and
// tuples in runtime comments. Adapt those comments only while generating docs.
exports.handlers = {
    beforeParse(event) {
        event.source = event.source
            .replace(/\{(St\.Widget|BaseSection) & \{_delegate\?: object\}\}/g, '{$1}')
            .replace(/\{\[string, St\.Corner\]\[\]\}/g, '{Array<Array<string|St.Corner>>}')
            .replace(/\{ReturnType<typeof import\('[^']+'\)\.makeDraggable>\}/g, '{object}');
    },
};
