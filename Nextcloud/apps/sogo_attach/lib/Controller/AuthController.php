<?php

declare(strict_types=1);

namespace OCA\SogoAttach\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

class AuthController extends Controller
{
    private const ALLOWED_ORIGIN =
        'https://mail.example.com';

    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $userSession
    ) {
        parent::__construct(
            $appName,
            $request
        );
    }

    /**
     * Returns the current Nextcloud authentication state.
     *
     * @PublicPage
     * @NoCSRFRequired
     */
    public function status(): JSONResponse
    {
        $user =
            $this->userSession->getUser();

        return $this->cors(
            new JSONResponse([
                'authenticated' =>
                    $user !== null,
                'user' =>
                    $user?->getUID(),
            ])
        );
    }

    /**
     * Starts a native Nextcloud Login Flow v2.
     *
     * @PublicPage
     * @NoCSRFRequired
     */
    public function start(): JSONResponse
    {
        try {
            $user =
                $this->userSession->getUser();

            /*
             * Do not start a new Login Flow when a valid
             * Nextcloud session already exists.
             */
            if ($user !== null) {
                return $this->cors(
                    new JSONResponse([
                        'authenticated' => true,
                        'user' => $user->getUID(),
                    ])
                );
            }

            /*
             * Build the URL from the current Nextcloud host.
             */
            $scheme =
                $this->request->getServerProtocol();

            /*
             * getServerProtocol() returns values such as HTTP/1.1,
             * not a URL scheme, so HTTPS is explicitly used here.
             *
             * This instance is served through HTTPS.
             */
            unset($scheme);

            $host =
                $this->request->getServerHost();

            if ($host === '') {
                throw new \RuntimeException(
                    'Unable to determine the Nextcloud host.'
                );
            }

            $loginFlowUrl =
                'https://' .
                $host .
                '/index.php/login/v2';


            $curl =
                curl_init($loginFlowUrl);

            if ($curl === false) {
                throw new \RuntimeException(
                    'Unable to initialize Login Flow request.'
                );
            }


            curl_setopt_array(
                $curl,
                [
                    CURLOPT_POST => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_HEADER => false,
                    CURLOPT_TIMEOUT => 10,
                    CURLOPT_HTTPHEADER => [
                        'Accept: application/json',
                    ],
                ]
            );


            $result =
                curl_exec($curl);

            if ($result === false) {

                $curlError =
                    curl_error($curl);

                curl_close($curl);

                throw new \RuntimeException(
                    'Unable to start Login Flow v2: ' .
                    $curlError
                );
            }


            $status =
                curl_getinfo(
                    $curl,
                    CURLINFO_HTTP_CODE
                );

            curl_close($curl);


            if (
                $status < 200 ||
                $status >= 300
            ) {
                throw new \RuntimeException(
                    'Login Flow v2 returned HTTP ' .
                    $status
                );
            }


            $data =
                json_decode(
                    $result,
                    true,
                    512,
                    JSON_THROW_ON_ERROR
                );


            if (
                empty($data['login']) ||
                empty($data['poll']['endpoint']) ||
                empty($data['poll']['token'])
            ) {
                throw new \RuntimeException(
                    'Invalid Login Flow v2 response.'
                );
            }


            return $this->cors(
                new JSONResponse([
                    'authenticated' => false,
                    'login' => $data['login'],
                    'poll' => $data['poll'],
                ])
            );

        } catch (\Throwable $exception) {

            \OC::$server
                ->getLogger()
                ->error(
                    '[sogo_attach] Unable to start Login Flow: ' .
                    $exception->getMessage(),
                    [
                        'app' => 'sogo_attach',
                        'exception' => $exception,
                    ]
                );

            return $this->cors(
                new JSONResponse(
                    [
                        'success' => false,
                        'error' =>
                            'Unable to start the Nextcloud login process.',
                    ],
                    500
                )
            );
        }
    }

    /**
     * Adds CORS headers for the trusted SOGo origin.
     */
    private function cors(
        JSONResponse $response
    ): JSONResponse {
        $origin =
            $this->request->getHeader(
                'Origin'
            );

        if (
            $origin !== self::ALLOWED_ORIGIN
        ) {
            return $response;
        }

        $response->addHeader(
            'Access-Control-Allow-Origin',
            self::ALLOWED_ORIGIN
        );

        $response->addHeader(
            'Access-Control-Allow-Credentials',
            'true'
        );

        $response->addHeader(
            'Access-Control-Allow-Methods',
            'GET, POST, OPTIONS'
        );

        $response->addHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Accept, requesttoken, OC-RequestToken'
        );

        $response->addHeader(
            'Vary',
            'Origin'
        );

        return $response;
    }
}
