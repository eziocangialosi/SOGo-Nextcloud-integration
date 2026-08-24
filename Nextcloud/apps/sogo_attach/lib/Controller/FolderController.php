<?php

declare(strict_types=1);

namespace OCA\SogoAttach\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

class FolderController extends Controller
{
    private const ALLOWED_ORIGIN =
        'https://mail.example.com';

    public function __construct(
        string $appName,
        IRequest $request,
        private IRootFolder $rootFolder,
        private IUserSession $userSession
    ) {
        parent::__construct(
            $appName,
            $request
        );
    }

    /**
     * Returns the list of child folders for the requested path.
     */
    public function list(
        string $path = '/'
    ): JSONResponse {
        $user =
            $this->userSession->getUser();

        if ($user === null) {
            return $this->cors(
                new JSONResponse(
                    [
                        'success' => false,
                        'error' =>
                            'Nextcloud user is not authenticated.',
                    ],
                    401
                )
            );
        }

        try {
            $userFolder =
                $this->rootFolder->getUserFolder(
                    $user->getUID()
                );

            $path =
                $this->normalizePath($path);


            /*
             * The root folder must be handled directly because
             * getUserFolder() already represents it.
             */
            $folder =
                $path === '/'
                    ? $userFolder
                    : $userFolder->get($path);


            if (!$folder instanceof Folder) {
                return $this->cors(
                    new JSONResponse(
                        [
                            'success' => false,
                            'error' =>
                                'The requested path is not a folder.',
                        ],
                        400
                    )
                );
            }


            $folders =
                [];


            foreach (
                $folder->getDirectoryListing()
                as $node
            ) {

                if (!$node instanceof Folder) {
                    continue;
                }


                $relativePath =
                    $this->getRelativePath(
                        $userFolder,
                        $node
                    );


                $folders[] =
                    [
                        'name' =>
                            $node->getName(),

                        'path' =>
                            $relativePath,
                    ];
            }


            usort(
                $folders,
                static function (
                    array $left,
                    array $right
                ): int {
                    return strcasecmp(
                        $left['name'],
                        $right['name']
                    );
                }
            );


            return $this->cors(
                new JSONResponse([
                    'success' => true,
                    'path' => $path,
                    'folders' => $folders,
                ])
            );

        } catch (\Throwable $exception) {

            \OC::$server
                ->getLogger()
                ->error(
                    '[sogo_attach] Unable to read folders: ' .
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
                            'Unable to read the requested folder.',
                    ],
                    500
                )
            );
        }
    }

    /**
     * Normalizes a path inside the authenticated user's files.
     *
     * Parent directory traversal is rejected.
     */
    private function normalizePath(
        string $path
    ): string {
        $path =
            trim($path);

        if ($path === '') {
            return '/';
        }

        if ($path[0] !== '/') {
            $path =
                '/' . $path;
        }


        $parts =
            explode(
                '/',
                $path
            );

        $cleanParts =
            [];


        foreach ($parts as $part) {

            if (
                $part === '' ||
                $part === '.'
            ) {
                continue;
            }

            if ($part === '..') {
                throw new \InvalidArgumentException(
                    'Invalid folder path.'
                );
            }

            $cleanParts[] =
                $part;
        }


        return $cleanParts === []
            ? '/'
            : '/' . implode(
                '/',
                $cleanParts
            );
    }

    /**
     * Converts an absolute Nextcloud node path into a path
     * relative to the current user's root folder.
     */
    private function getRelativePath(
        Folder $userFolder,
        Folder $folder
    ): string {
        $userFolderPath =
            rtrim(
                $userFolder->getPath(),
                '/'
            );

        $nodePath =
            $folder->getPath();


        if (
            !str_starts_with(
                $nodePath,
                $userFolderPath
            )
        ) {
            throw new \RuntimeException(
                'Folder is outside the user root.'
            );
        }


        $relativePath =
            substr(
                $nodePath,
                strlen($userFolderPath)
            );


        if (
            $relativePath === false ||
            $relativePath === ''
        ) {
            return '/';
        }


        return $relativePath[0] === '/'
            ? $relativePath
            : '/' . $relativePath;
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

        return $response;
    }
}
