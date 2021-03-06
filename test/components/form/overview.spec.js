import faker from '../../faker';
import testData from '../../data';
import { mockLogin, mockRouteThroughLogin } from '../../session';
import { mockRoute } from '../../http';
import { trigger } from '../../util';

const overviewPath = (form) =>
  `/projects/1/forms/${encodeURIComponent(form.xmlFormId)}`;

describe('FormOverview', () => {
  describe('anonymous users', () => {
    it('redirects an anonymous user to login', () =>
      mockRoute('/projects/1/forms/x')
        .restoreSession(false)
        .afterResponse(app => {
          app.vm.$route.path.should.equal('/login');
        }));

    it('redirects the user back after login', () => {
      const project = testData.extendedProjects.createPast(1).last();
      const form = testData.extendedForms.createPast(1).last();
      return mockRouteThroughLogin(overviewPath(form))
        .respondWithData(() => project)
        .respondWithData(() => form)
        .respondWithData(() => testData.extendedFormAttachments.sorted())
        .afterResponses(app => {
          app.vm.$route.path.should.equal(overviewPath(form));
        });
    });
  });

  describe('after login', () => {
    beforeEach(mockLogin);

    const loadOverview = ({
      attachmentCount = 0,
      allAttachmentsExist,
      hasSubmission = false,
      formIsOpen = true,
      fieldKeyCount = 0
    }) => {
      testData.extendedProjects.createPast(1, { appUsers: fieldKeyCount });
      const state = formIsOpen
        ? 'open'
        : faker.random.arrayElement(['closing', 'closed']);
      const submissions = hasSubmission ? faker.random.number({ min: 1 }) : 0;
      testData.extendedForms.createPast(1, { state, submissions });
      if (attachmentCount !== 0) {
        testData.extendedFormAttachments.createPast(
          attachmentCount,
          { exists: allAttachmentsExist }
        );
      }
      return mockRoute(overviewPath(testData.extendedForms.last()))
        .respondWithData(() => testData.extendedProjects.last())
        .respondWithData(() => testData.extendedForms.last())
        .respondWithData(() => testData.extendedFormAttachments.sorted());
    };

    describe('submission count', () => {
      it('no submissions', () =>
        loadOverview({ hasSubmission: false }).afterResponses(app => {
          const steps = app.find('.form-overview-step');
          const step3Text = steps[2].find('p')[1].text().trim();
          step3Text.should.containEql('Nobody has submitted any data to this Form yet.');
          const step4Text = steps[3].find('p')[1].text().trim();
          step4Text.should.containEql('Once there is data for this Form,');
        }));

      it('at least one submission', () =>
        loadOverview({ hasSubmission: true }).afterResponses(app => {
          const count = testData.extendedForms.last().submissions
            .toLocaleString();
          app.find('.form-overview-step')[2].find('p')[1].text().trim()
            .should.containEql(count);
          app.find('.form-overview-step')[3].find('p')[1].text().trim()
            .should.containEql(count);
        }));
    });

    describe('app user count', () => {
      it('no app users', () =>
        loadOverview({ fieldKeyCount: 0 }).afterResponses(app => {
          const step = app.find('.form-overview-step')[2];
          const text = step.find('p')[1].text().trim();
          text.should.containEql('You have not created any App Users for this Project yet');
        }));

      it('at least one app user', () =>
        loadOverview({ fieldKeyCount: 1 }).afterResponses(app => {
          const step = app.find('.form-overview-step')[2];
          const text = step.find('p')[1].text().trim().iTrim();
          text.should.containEql('1 App User');
        }));
    });

    it('marks step 5 as complete if form state is changed from open', () =>
      loadOverview({ formIsOpen: true })
        .afterResponses(app => {
          const step = app.find('.form-overview-step')[4];
          step.hasClass('form-overview-step-complete').should.be.false();
        })
        .route(`/projects/1/forms/${testData.extendedForms.last().xmlFormId}/settings`)
        .request(app => {
          const formEdit = app.first('#form-edit');
          const closed = formEdit.first('input[type="radio"][value="closed"]');
          return trigger.change(closed);
        })
        .respondWithSuccess()
        .complete()
        .route(overviewPath(testData.extendedForms.last()))
        .then(app => {
          const step = app.find('.form-overview-step')[4];
          step.hasClass('form-overview-step-complete').should.be.true();
        }));

    describe('step stages', () => {
      // Array of test cases
      const cases = [
        {
          allAttachmentsExist: false,
          hasSubmission: false,
          formIsOpen: false,
          completedSteps: [0, 4],
          currentStep: 1
        },
        {
          allAttachmentsExist: false,
          hasSubmission: false,
          formIsOpen: true,
          completedSteps: [0],
          currentStep: 1
        },
        {
          allAttachmentsExist: false,
          hasSubmission: true,
          formIsOpen: false,
          completedSteps: [0, 2, 4],
          currentStep: 1
        },
        {
          allAttachmentsExist: false,
          hasSubmission: true,
          formIsOpen: true,
          completedSteps: [0, 2],
          currentStep: 1
        },
        {
          allAttachmentsExist: true,
          hasSubmission: false,
          formIsOpen: false,
          completedSteps: [0, 1, 4],
          currentStep: 2
        },
        {
          allAttachmentsExist: true,
          hasSubmission: false,
          formIsOpen: true,
          completedSteps: [0, 1],
          currentStep: 2
        },
        {
          allAttachmentsExist: true,
          hasSubmission: true,
          formIsOpen: false,
          completedSteps: [0, 1, 2, 4],
          currentStep: 3
        },
        {
          allAttachmentsExist: true,
          hasSubmission: true,
          formIsOpen: true,
          completedSteps: [0, 1, 2],
          currentStep: 3
        }
      ];

      // Tests the stages of the form overview steps for a single test case.
      const testStepStages = ({ completedSteps, currentStep, ...loadOverviewArgs }) =>
        loadOverview(loadOverviewArgs).afterResponses(app => {
          const steps = app.find('.form-overview-step');
          steps.length.should.equal(5);
          for (let i = 0; i < steps.length; i += 1) {
            if (completedSteps.includes(i)) {
              steps[i].hasClass('form-overview-step-complete').should.be.true();
            } else if (i === currentStep) {
              steps[i].hasClass('form-overview-step-current').should.be.true();
            } else {
              steps[i].hasClass('form-overview-step-later').should.be.true();
            }
          }
        });

      for (let i = 0; i < cases.length; i += 1) {
        const testCase = cases[i];
        describe(`case ${i}`, () => {
          it('1 attachment', () =>
            testStepStages({ ...cases[i], attachmentCount: 1 }));

          if (testCase.allAttachmentsExist) {
            it('no attachments', () =>
              testStepStages({ ...cases[i], attachmentCount: 0 }));
          }
        });
      }
    });
  });
});
