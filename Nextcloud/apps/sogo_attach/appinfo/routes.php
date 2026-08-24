<?php

declare(strict_types=1);

return [
    'routes' => [
        [
            'name' => 'upload#upload',
            'url' => '/upload',
            'verb' => 'POST',
        ],
        [
            'name' => 'upload#options',
            'url' => '/upload',
            'verb' => 'OPTIONS',
        ],
        [
            'name' => 'auth#status',
            'url' => '/auth/status',
            'verb' => 'GET',
        ],
        [
            'name' => 'auth#start',
            'url' => '/auth/start',
            'verb' => 'POST',
        ],
        [
            'name' => 'folder#list',
            'url' => '/folders',
            'verb' => 'GET',
        ],
    ],
];
