<?php

declare(strict_types=1);

namespace OCA\SogoAttach\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IRequest;
use OCP\IUserSession;

class UploadController extends Controller
{
    private const ALLOWED_ORIGIN = 'https://mail.example.com';

    public function __construct(
        string $appName,
        IRequest $request,
        private IRootFolder $rootFolder,
        private IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Handle the CORS preflight request.
     *
     * @NoCSRFRequired
     * @PublicPage
     */
    public function options(): Response
    {
        $response = new Response();
        $response->setStatus(204);

        $response->addHeader('Access-Control-Allow-Origin', self::ALLOWED_ORIGIN);
        $response->addHeader('Access-Control-Allow-Credentials', 'true');
        $response->addHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        $response->addHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, X-Requested-With, requesttoken, OC-RequestToken'
        );
        $response->addHeader('Access-Control-Max-Age', '86400');
        $response->addHeader('Vary', 'Origin');

        return $response;
    }

    /**
     * Store an uploaded SOGo attachment in the selected Nextcloud folder.
     *
     * @NoCSRFRequired
     * @PublicPage
     */
    public function upload(): JSONResponse
    {
        $origin = $this->request->getHeader('Origin');

        try {
            $user = $this->userSession->getUser();

            if ($user === null) {
                return $this->errorResponse(
                    'No Nextcloud user is currently authenticated.',
                    401,
                    $origin
                );
            }

            $file = $this->request->getUploadedFile('file');

            if (!$file) {
                return $this->errorResponse(
                    'No file was received.',
                    400,
                    $origin
                );
            }

            if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                return $this->errorResponse(
                    'PHP reported an error while receiving the file.',
                    400,
                    $origin
                );
            }

            $originalFilename = (string)($file['name'] ?? 'attachment');
            $filename = $this->sanitizeFilename($originalFilename);
            $targetPath = $this->normalizeTargetPath(
                $this->request->getParam('path', '/')
            );

            if ($targetPath === null) {
                return $this->errorResponse(
                    'Invalid destination path.',
                    400,
                    $origin
                );
            }

            $userFolder = $this->rootFolder->getUserFolder($user->getUID());

            try {
                $targetFolder = $userFolder->get($targetPath);
            } catch (\Throwable) {
                return $this->errorResponse(
                    'Destination folder does not exist: ' . $targetPath,
                    400,
                    $origin
                );
            }

            if (!$targetFolder instanceof Folder) {
                return $this->errorResponse(
                    'Destination path is not a folder: ' . $targetPath,
                    400,
                    $origin
                );
            }

            $filename = $targetFolder->getNonExistingName($filename);
            $tmpName = (string)($file['tmp_name'] ?? '');

            if ($tmpName === '' || !is_uploaded_file($tmpName)) {
                return $this->errorResponse(
                    'The uploaded temporary file is invalid.',
                    400,
                    $origin
                );
            }

            $content = file_get_contents($tmpName);

            if ($content === false) {
                return $this->errorResponse(
                    'Unable to read the uploaded file.',
                    500,
                    $origin
                );
            }

            $targetFile = $targetFolder->newFile($filename, $content);

            return $this->addCorsHeaders(
                new JSONResponse(
                    [
                        'success' => true,
                        'message' => 'File successfully added to Nextcloud.',
                        'filename' => $filename,
                        'original_filename' => $originalFilename,
                        'target_path' => $targetPath,
                        'path' => $targetFile->getPath(),
                        'size' => $targetFile->getSize(),
                    ],
                    200
                ),
                $origin
            );
        } catch (\Throwable $e) {
            \OC::$server->getLogger()->error(
                '[sogo_attach] Upload failed: ' . $e->getMessage(),
                [
                    'app' => 'sogo_attach',
                    'exception' => $e,
                ]
            );

            return $this->errorResponse(
                'Failed to store the file: ' . $e->getMessage(),
                500,
                $origin
            );
        }
    }

    private function sanitizeFilename(string $filename): string
    {
        $filename = trim(basename($filename));

        if ($filename === '' || $filename === '.' || $filename === '..') {
            return 'attachment';
        }

        return $filename;
    }

    private function normalizeTargetPath(mixed $path): ?string
    {
        if (!is_string($path) || $path === '') {
            return '/';
        }

        if ($path[0] !== '/') {
            $path = '/' . $path;
        }

        $path = preg_replace('#/+#', '/', $path) ?? '/';
        $parts = explode('/', $path);
        $cleanParts = [];

        foreach ($parts as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }

            if ($part === '..') {
                return null;
            }

            $cleanParts[] = $part;
        }

        return $cleanParts === []
            ? '/'
            : '/' . implode('/', $cleanParts);
    }

    private function errorResponse(
        string $message,
        int $status,
        string $origin
    ): JSONResponse {
        return $this->addCorsHeaders(
            new JSONResponse(
                [
                    'success' => false,
                    'error' => $message,
                ],
                $status
            ),
            $origin
        );
    }

    private function addCorsHeaders(
        JSONResponse $response,
        string $origin
    ): JSONResponse {
        if ($origin === self::ALLOWED_ORIGIN) {
            $response->addHeader(
                'Access-Control-Allow-Origin',
                self::ALLOWED_ORIGIN
            );
            $response->addHeader('Access-Control-Allow-Credentials', 'true');
            $response->addHeader('Vary', 'Origin');
        }

        return $response;
    }
}
