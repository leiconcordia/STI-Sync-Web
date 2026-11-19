import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePARRemarksDescription } from '../par-remarks.utils.ts';

describe('PAR Remarks Resolution (Single Description)', () => {
  test('prefers unified remarks and recommendations.description fields', () => {
    assert.equal(
      resolvePARRemarksDescription({
        remarks: 'Overall event ran smoothly with high student turnout.',
      }),
      'Overall event ran smoothly with high student turnout.'
    );

    assert.equal(
      resolvePARRemarksDescription({
        recommendations: {
          description: 'Improve microphone check 30 minutes prior to program start.',
        },
      }),
      'Improve microphone check 30 minutes prior to program start.'
    );
  });

  test('falls back cleanly for legacy 4-area PAR documents', () => {
    const legacy = resolvePARRemarksDescription({
      recommendations: {
        programFlow: {
          observations: 'Started on time.',
          recommendations: 'Maintain tight schedule.',
        },
        technicalSetup: {
          observations: 'Projector cable was loose.',
          recommendations: 'Prepare backup HDMI.',
        },
      },
    });
    assert.match(legacy, /1\. Program Flow and Content/);
    assert.match(legacy, /• Started on time\./);
    assert.match(legacy, /3\. Technical Setup/);
    assert.match(legacy, /• Prepare backup HDMI\./);
  });
});
